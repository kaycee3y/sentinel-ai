/**
 * MCP-backed implementation of DataHubService.
 *
 * This file — and only this file — knows that "DataHub" currently means
 * "call an MCP server over HTTP with these tool names." If DataHub ships a
 * native TypeScript SDK later, or we need to fall back to raw GraphQL for
 * something MCP doesn't expose, this is the only place that changes.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type {
  DataHubService,
  DataHubServiceConfig,
  SearchOptions,
  SearchResultItem,
  LineageOptions,
  LineageResult,
  LineagePath,
  EntityDetail,
  SchemaField,
  DatasetQuery,
  SaveDocumentInput,
  DataHubUrn,
} from "./types";

export class DataHubMcpClient implements DataHubService {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private readonly config: DataHubServiceConfig) {}

  private async getClient(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const transport = new StreamableHTTPClientTransport(new URL(this.config.endpoint), {
        requestInit: {
          headers: { Authorization: `Bearer ${this.config.personalAccessToken}` },
        },
      });

      const client = new Client({ name: "sentinel-ai", version: "1.0.0" }, { capabilities: {} });
      await client.connect(transport);
      this.client = client;
      return client;
    })();

    return this.connecting;
  }

  private async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const client = await this.getClient();
    const result = await client.callTool(
      { name, arguments: args },
      undefined,
      { timeout: this.config.requestTimeoutMs ?? 20_000 }
    );

    if (result.isError) {
      throw new DataHubToolError(name, result);
    }

    const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
      (block) => block.type === "text"
    );
    if (!textBlock?.text) {
      throw new Error(`Tool "${name}" returned no parseable content.`);
    }
    return JSON.parse(textBlock.text) as T;
  }

  async search(options: SearchOptions): Promise<SearchResultItem[]> {
    const raw = await this.callTool<RawSearchResponse>("search", {
      query: options.query,
      entity_types: options.entityTypes,
      limit: options.limit ?? 10,
    });
    return raw.results.map(mapSearchResult);
  }

  async getLineage(options: LineageOptions): Promise<LineageResult> {
    const raw = await this.callTool<RawLineageResponse>("get_lineage", {
      urn: options.urn,
      direction: options.direction,
      max_hops: options.maxHops ?? 2,
    });
    return {
      root: options.urn,
      nodes: raw.nodes.map(mapLineageNode),
      edges: raw.edges.map((e) => ({ from: e.from, to: e.to, relationshipType: e.type })),
    };
  }

  async getLineagePathsBetween(from: DataHubUrn, to: DataHubUrn): Promise<LineagePath[]> {
    const raw = await this.callTool<RawPathsResponse>("get_lineage_paths_between", {
      source_urn: from,
      destination_urn: to,
    });
    return raw.paths.map((p) => ({
      path: p.urns,
      transformations: p.transformations?.map((t) => ({ urn: t.urn, sql: t.sql })),
    }));
  }

  async getEntity(urn: DataHubUrn): Promise<EntityDetail | null> {
    const entities = await this.getEntities([urn]);
    return entities[0] ?? null;
  }

  async getEntities(urns: DataHubUrn[]): Promise<EntityDetail[]> {
    if (urns.length === 0) return [];
    const raw = await this.callTool<RawEntitiesResponse>("get_entities", { urns });
    return raw.entities.map(mapEntityDetail);
  }

  async listSchemaFields(urn: DataHubUrn): Promise<SchemaField[]> {
    const raw = await this.callTool<RawSchemaFieldsResponse>("list_schema_fields", { urn });
    return raw.fields.map((f) => ({
      fieldPath: f.field_path,
      type: f.type,
      description: f.description,
      tags: f.tags,
    }));
  }

  async getDatasetQueries(urn: DataHubUrn): Promise<DatasetQuery[]> {
    const raw = await this.callTool<RawQueriesResponse>("get_dataset_queries", { urn });
    return raw.queries.map((q) => ({
      query: q.query,
      lastExecutedAt: q.last_executed_at,
      executionCount: q.execution_count,
    }));
  }

  async saveFinding(input: SaveDocumentInput): Promise<{ urn: DataHubUrn }> {
    if (!this.config.mutationsEnabled) {
      throw new Error(
        "saveFinding() called but mutations are disabled for this DataHubService instance."
      );
    }
    const raw = await this.callTool<{ urn: DataHubUrn }>("save_document", {
      title: input.title,
      content: input.content,
      related_urns: input.relatedUrns,
    });
    return { urn: raw.urn };
  }
}

export class DataHubToolError extends Error {
  constructor(public readonly toolName: string, public readonly raw: unknown) {
    super(`DataHub MCP tool "${toolName}" returned an error.`);
    this.name = "DataHubToolError";
  }
}

// ---------------------------------------------------------------------------
// Raw MCP response shapes + mappers — kept private to this file on purpose.
// ---------------------------------------------------------------------------

interface RawSearchResponse {
  results: { urn: string; name: string; entity_type: string; description?: string; platform?: string }[];
}
function mapSearchResult(r: RawSearchResponse["results"][number]): SearchResultItem {
  return { urn: r.urn, name: r.name, entityType: r.entity_type, description: r.description, platform: r.platform };
}

interface RawLineageResponse {
  nodes: { urn: string; name: string; entity_type: string; platform?: string }[];
  edges: { from: string; to: string; type?: string }[];
}
function mapLineageNode(n: RawLineageResponse["nodes"][number]) {
  return { urn: n.urn, name: n.name, entityType: n.entity_type, platform: n.platform };
}

interface RawPathsResponse {
  paths: { urns: string[]; transformations?: { urn: string; sql?: string }[] }[];
}

interface RawEntitiesResponse {
  entities: {
    urn: string;
    name: string;
    entity_type: string;
    description?: string;
    platform?: string;
    owners?: { urn: string; name: string; type?: string }[];
    tags?: string[];
    glossary_terms?: string[];
    domain?: { urn: string; name: string };
    usage?: { query_count_30d?: number; unique_user_count_30d?: number };
  }[];
}
function mapEntityDetail(e: RawEntitiesResponse["entities"][number]): EntityDetail {
  return {
    urn: e.urn,
    name: e.name,
    entityType: e.entity_type,
    description: e.description,
    platform: e.platform,
    owners: e.owners ?? [],
    tags: e.tags ?? [],
    glossaryTerms: e.glossary_terms ?? [],
    domain: e.domain,
    usage: e.usage
      ? { queryCount30d: e.usage.query_count_30d, uniqueUserCount30d: e.usage.unique_user_count_30d }
      : undefined,
  };
}

interface RawSchemaFieldsResponse {
  fields: { field_path: string; type: string; description?: string; tags?: string[] }[];
}

interface RawQueriesResponse {
  queries: { query: string; last_executed_at?: string; execution_count?: number }[];
}