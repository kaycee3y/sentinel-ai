/**
 * DataHub Service — the abstraction every agent depends on.
 */

export type DataHubUrn = string;

export interface SearchOptions {
  query: string;
  entityTypes?: string[];
  limit?: number;
}

export interface SearchResultItem {
  urn: DataHubUrn;
  name: string;
  entityType: string;
  description?: string;
  platform?: string;
}

export interface LineageOptions {
  urn: DataHubUrn;
  direction: "upstream" | "downstream";
  maxHops?: number;
}

export interface LineageNode {
  urn: DataHubUrn;
  name: string;
  entityType: string;
  platform?: string;
}

export interface LineageEdge {
  from: DataHubUrn;
  to: DataHubUrn;
  relationshipType?: string;
}

export interface LineageResult {
  root: DataHubUrn;
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export interface EntityDetail {
  urn: DataHubUrn;
  name: string;
  entityType: string;
  description?: string;
  platform?: string;
  owners: { urn: DataHubUrn; name: string; type?: string }[];
  tags: string[];
  glossaryTerms: string[];
  domain?: { urn: DataHubUrn; name: string };
  usage?: {
    queryCount30d?: number;
    uniqueUserCount30d?: number;
  };
}

export interface SchemaField {
  fieldPath: string;
  type: string;
  description?: string;
  tags?: string[];
}

export interface DatasetQuery {
  query: string;
  lastExecutedAt?: string;
  executionCount?: number;
}

export interface LineagePath {
  path: DataHubUrn[];
  transformations?: { urn: DataHubUrn; sql?: string }[];
}

export interface SaveDocumentInput {
  title: string;
  content: string;
  relatedUrns?: DataHubUrn[];
}

export interface DataHubService {
  search(options: SearchOptions): Promise<SearchResultItem[]>;
  getLineage(options: LineageOptions): Promise<LineageResult>;
  getLineagePathsBetween(from: DataHubUrn, to: DataHubUrn): Promise<LineagePath[]>;
  getEntity(urn: DataHubUrn): Promise<EntityDetail | null>;
  getEntities(urns: DataHubUrn[]): Promise<EntityDetail[]>;
  listSchemaFields(urn: DataHubUrn): Promise<SchemaField[]>;
  getDatasetQueries(urn: DataHubUrn): Promise<DatasetQuery[]>;
  saveFinding(input: SaveDocumentInput): Promise<{ urn: DataHubUrn }>;
}

export interface DataHubServiceConfig {
  endpoint: string;
  personalAccessToken: string;
  mutationsEnabled?: boolean;
  requestTimeoutMs?: number;
}