import { PERMISSIONS } from "../authorization.js";

const queryErrors = ["INVALID_ARGUMENT", "SCHEMA_VIOLATION", "NOT_FOUND", "FORBIDDEN", "REPOSITORY_BUSY", "INTEGRITY_FAILURE", "INTERNAL_ERROR"];
const commandErrors = ["INVALID_ARGUMENT", "SCHEMA_VIOLATION", "NOT_FOUND", "FORBIDDEN", "VERSION_CONFLICT", "REPOSITORY_BUSY", "INTEGRITY_FAILURE", "INTERNAL_ERROR"];

function tool(name, service, permission, kind, input, errors = kind === "query" ? queryErrors : commandErrors) {
  return Object.freeze({ name, service, permission, kind, input, output: "OperationResponse", errors: Object.freeze(errors) });
}

export const TOOL_CATALOG = Object.freeze([
  tool("requirements.get", "GetRequirementService", PERMISSIONS.READ, "query", "GetRequest"),
  tool("requirements.search", "SearchRequirementsService", PERMISSIONS.READ, "query", "SearchRequest"),
  tool("requirements.list", "ListRequirementsService", PERMISSIONS.READ, "query", "ListRequest"),
  tool("requirements.trace", "TraceRequirementsService", PERMISSIONS.READ, "query", "TraceRequest"),
  tool("requirements.coverage", "CoverageService", PERMISSIONS.READ, "query", "CoverageRequest"),
  tool("requirements.orphans", "OrphanRequirementsService", PERMISSIONS.READ, "query", "OrphanRequest"),
  tool("requirements.impact", "ImpactAnalysisService", PERMISSIONS.READ, "query", "ImpactRequest"),
  tool("requirements.compare", "CompareRequirementsService", PERMISSIONS.READ, "query", "CompareRequest"),
  tool("requirements.history", "HistoryService", PERMISSIONS.READ, "query", "HistoryRequest"),
  tool("requirements.report", "ReportService", PERMISSIONS.READ, "query", "ReportRequest"),
  tool("requirements.validateDraft", "ValidateDraftService", PERMISSIONS.VALIDATE_DRAFT, "query", "ValidateDraftRequest"),
  tool("requirements.create", "CreateRequirementService", PERMISSIONS.MUTATE, "command", "CreateRequest"),
  tool("requirements.update", "UpdateRequirementService", PERMISSIONS.MUTATE, "command", "UpdateRequest"),
  tool("requirements.retire", "RetireRequirementService", PERMISSIONS.MUTATE, "command", "RetireRequest"),
  tool("requirements.link", "LinkRequirementService", PERMISSIONS.MUTATE, "command", "LinkRequest"),
  tool("requirements.unlink", "UnlinkRequirementService", PERMISSIONS.MUTATE, "command", "UnlinkRequest"),
  tool("requirements.reassessLink", "ReassessRelationshipService", PERMISSIONS.DECIDE, "command", "ReassessLinkRequest"),
  tool("requirements.bulkPreview", "BulkPreviewService", PERMISSIONS.MUTATE, "command", "BulkPreviewRequest"),
  tool("requirements.bulkCommit", "BulkCommitService", PERMISSIONS.MUTATE, "command", "BulkCommitRequest", [...commandErrors, "PREVIEW_EXPIRED"]),
  tool("requirements.possibleTransitions", "PossibleTransitionsService", PERMISSIONS.READ, "query", "PossibleTransitionsRequest"),
  tool("requirements.transition", "TransitionRequirementService", PERMISSIONS.MUTATE, "command", "TransitionRequest"),
  tool("changes.create", "CreateChangeService", PERMISSIONS.MUTATE, "command", "ChangeCreateRequest"),
  tool("changes.triage", "TriageChangeService", PERMISSIONS.MUTATE, "command", "ChangeTriageRequest"),
  tool("changes.analyze", "AnalyzeChangeService", PERMISSIONS.MUTATE, "command", "ChangeAnalyzeRequest"),
  tool("changes.dispositionImpact", "DispositionImpactService", PERMISSIONS.MUTATE, "command", "ChangeDispositionImpactRequest"),
  tool("changes.decide", "DecideChangeService", PERMISSIONS.DECIDE, "command", "ChangeDecisionRequest"),
  tool("changes.previewImplementation", "PreviewChangeImplementationService", PERMISSIONS.MUTATE, "command", "ChangePreviewImplementationRequest"),
  tool("changes.commitImplementation", "CommitChangeImplementationService", PERMISSIONS.MUTATE, "command", "ChangeCommitImplementationRequest", [...commandErrors, "PREVIEW_EXPIRED"]),
  tool("changes.implement", "CommitChangeImplementationService", PERMISSIONS.MUTATE, "command", "ChangeCommitImplementationRequest", [...commandErrors, "PREVIEW_EXPIRED"]),
  tool("changes.close", "CloseChangeService", PERMISSIONS.DECIDE, "command", "ChangeCloseRequest"),
  tool("changes.get", "GetChangeService", PERMISSIONS.READ, "query", "ChangeGetRequest"),
  tool("workflow.dashboard", "WorkflowDashboardService", PERMISSIONS.READ, "query", "WorkflowDashboardRequest"),
  tool("reviews.create", "CreateReviewService", PERMISSIONS.MUTATE, "command", "ReviewCreateRequest"),
  tool("reviews.recordDecision", "RecordReviewDecisionService", PERMISSIONS.DECIDE, "command", "DecisionRequest"),
  tool("baselines.checkReadiness", "CheckBaselineReadinessService", PERMISSIONS.READ, "query", "BaselineReadinessRequest"),
  tool("baselines.create", "CreateBaselineService", PERMISSIONS.BASELINE, "command", "BaselineCreateRequest"),
  tool("baselines.get", "GetBaselineService", PERMISSIONS.READ, "query", "BaselineGetRequest"),
  tool("baselines.compare", "CompareBaselineService", PERMISSIONS.READ, "query", "CompareRequest"),
  tool("imports.preview", "PreviewImportService", PERMISSIONS.IMPORT, "command", "ImportPreviewRequest"),
  tool("imports.commit", "CommitImportService", PERMISSIONS.IMPORT, "command", "ImportCommitRequest", [...commandErrors, "PREVIEW_EXPIRED"]),
  tool("configuration.get", "GetConfigurationService", PERMISSIONS.READ, "query", "ConfigurationGetRequest"),
  tool("configuration.update", "UpdateConfigurationService", PERMISSIONS.CONFIGURE, "command", "ConfigurationUpdateRequest"),
]);

export const TOOL_BY_NAME = new Map(TOOL_CATALOG.map((entry) => [entry.name, entry]));
