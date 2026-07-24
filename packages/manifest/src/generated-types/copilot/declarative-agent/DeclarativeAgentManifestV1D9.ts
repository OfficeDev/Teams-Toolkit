// To parse this data:
//
//   import { Convert, DeclarativeAgentManifestV1D9 } from "./file";
//
//   const declarativeAgentManifestV1D9 = Convert.toDeclarativeAgentManifestV1D9(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

/**
 * The root of the declarative agent manifest document is a JSON object that contains
 * members that describe the declarative agent.
 */
export interface DeclarativeAgentManifestV1D9 {
    /**
     * Required. Not localizable. The version of the schema this manifest is using.
     */
    version: "v1.9";
    /**
     * Optional. Not localizable.
     */
    id?: string;
    /**
     * Required. Localizable. The name of the declarative agent. It MUST contain at least one
     * nonwhitespace character and MUST be 100 characters or less.
     */
    name: string;
    /**
     * Required. Localizable. The description of the declarative agent. It MUST contain at least
     * one nonwhitespace character and MUST be 1,000 characters or less.
     */
    description: string;
    disclaimer?: Disclaimer;
    /**
     * Optional. Not localizable. The detailed instructions or guidelines on how the declarative
     * agent should behave, its functions, and any behaviors to avoid. It MUST contain at least
     * one nonwhitespace character and MUST be 8,000 characters or less.
     */
    instructions?: string;
    /**
     * Optional. A JSON object that contains configuration settings that modify the behavior of
     * the DA orchestration.
     */
    behavior_overrides?: BehaviorOverrides;
    /**
     * Optional. Contains an array of objects that define capabilities of the declarative agent.
     */
    capabilities?: CapabilityElement[];
    /**
     * Optional. A list of examples of questions that the declarative agent can answer. There
     * MUST NOT be more than 12 objects in the array.
     */
    conversation_starters?: ConversationStarterElement[];
    /**
     * Optional. A list of objects that identify API plugins that provide actions accessible to
     * the declarative agent.
     */
    actions?: ActionElement[];
    /**
     * Optional. A list of user override objects. This optional member allows DA authors to
     * specify which capabilities can be dynamically adjusted by the user of the DA.
     */
    user_overrides?: UserOverrideElement[];
    /**
     * Optional. A JSON object that contains predefined question-answer pairs that the DA can
     * use to respond to user queries based on semantic similarity.
     */
    editorial_answers?: EditorialAnswers;
    /**
     * Optional. A list of worker agent objects that identify declarative agents to act as
     * worker agents.
     */
    worker_agents?: WorkerAgentElement[];
    /**
     * Optional. A JSON object that specifies the sensitivity label for the DA.
     */
    sensitivity_label?: SensitivityLabel;
    /**
     * Optional. A list of objects that identify agent skill directories to bundle with the
     * declarative agent.
     */
    agent_skills?: AgentSkillElement[];
    [property: string]: any;
}

/**
 * Identifies an API plugin manifest for a plugin used as an action by the declarative agent.
 */
export interface ActionElement {
    /**
     * Required. Not localizable. A unique identifier for the action. It MAY be represented by a
     * GUID.
     */
    id: string;
    /**
     * Required. Not localizable. A path to the API plugin manifest for this action.
     */
    file: string;
    [property: string]: any;
}

/**
 * Identifies an agent skill directory to bundle with the declarative agent.
 */
export interface AgentSkillElement {
    /**
     * Required. The relative path to the skill directory containing a SKILL.md file.
     */
    folder: string;
    [property: string]: any;
}

/**
 * Optional. A JSON object that contains configuration settings that modify the behavior of
 * the DA orchestration.
 *
 * A JSON object that contains configuration settings that modify the behavior of the DA
 * orchestration.
 */
export interface BehaviorOverrides {
    /**
     * An object that contains special instructions for the declarative agent.
     */
    special_instructions?: SpecialInstructions;
    /**
     * An object that contains suggestions for behavior overrides for the declarative agent.
     */
    suggestions?: Suggestions;
    /**
     * Optional. The default response mode for the declarative agent.
     */
    default_response_mode?: DefaultResponseMode;
    [property: string]: any;
}

/**
 * Optional. The default response mode for the declarative agent.
 */
export type DefaultResponseMode = "Auto" | "Quick response" | "Think deeper";

/**
 * An object that contains special instructions for the declarative agent.
 *
 * A JSON object that contains members used for injecting special instructions into the
 * prompt. The object has a discourage_model_knowledge boolean property. If this property is
 * set to true, the DA will be discouraged from using model knowledge when generating
 * responses. The default value is false
 */
export interface SpecialInstructions {
    /**
     * A boolean value that indicates whether the declarative agent should be discouraged from
     * using model knowledge when generating responses.
     */
    discourage_model_knowledge?: boolean;
    [property: string]: any;
}

/**
 * An object that contains suggestions for behavior overrides for the declarative agent.
 *
 * A JSON object that contains configuration settings for the suggestions feature. The
 * object has a required disabled boolean property. If this property is set to true, the
 * suggestions feature will be disabled. The default value is false.
 */
export interface Suggestions {
    /**
     * A boolean value that indicates whether the suggestions feature is disabled. If this
     * property is set to true, the suggestions feature will be disabled. The default value is
     * false.
     */
    disabled?: boolean;
    [property: string]: any;
}

/**
 * Represents a base capability object.
 *
 * Indicates that the declarative agent can search the web for grounding information.
 *
 * Indicates that the declarative agent can search a user's SharePoint and OneDrive for
 * grounding information.
 *
 * Indicates that the declarative agent can search selected Microsoft Graph connectors for
 * grounding information.
 *
 * Indicates that the declarative agent can generate and execute code.
 *
 * Indicates that the declarative agent can generate images and art based on the text input
 * from the user.
 *
 * Indicates that the declarative agent can search through Teams channels, teams, meetings,
 * 1:1 chats and group chats.
 *
 * A JSON object whose presence indicates that the DA will be able to search within Email
 * Messages in the mailboxes user has access to.
 *
 * Indicates that the DA will be able to search people data in the organization.
 *
 * A JSON object whose presence indicates that the DA will be using tenant/task specific
 * models.
 *
 * Indicates that the DA can search through meetings.
 *
 * A JSON object whose presence indicates that the DA will be able to perform meeting and
 * calendar actions, such as scheduling events, creating time-finding polls, or surfacing
 * time insights.
 *
 * Indicates that the DA will be able to use files locally in the app package as knowledge.
 *
 * A JSON object whose presence indicates that the DA will be able to perform write
 * operations on email in the mailboxes the user has access to.
 */
export interface CapabilityElement {
    /**
     * Required. The name of the capability. Allowed values are WebSearch, GraphicArt,
     * CodeInterpreter, OneDriveAndSharePoint, GraphConnectors, TeamsMessages,
     * EmbeddedKnowledge, Email, EmailActions, People, Meetings, MeetingActions, Dataverse, and
     * ScenarioModels.
     *
     * Required. Must be set to WebSearch.
     *
     * Required. Must be set to OneDriveAndSharePoint.
     *
     * Required. Must be set to GraphConnectors.
     *
     * Required. Must be set to CodeInterpreter.
     *
     * Required. Must be set to GraphicArt.
     *
     * Required. Must be set to TeamsMessages.
     *
     * Required: Must be set to Dataverse
     *
     * Required: Must be set to Email
     *
     * Required. Must be set to People.
     *
     * Required. Must be set to the string literal `ScenarioModels`
     *
     * Required. Must be set to Meetings.
     *
     * Required. Must be set to MeetingActions.
     *
     * Required. Must be set to EmbeddedKnowledge.
     *
     * Required. Must be set to EmailActions.
     */
    name: Name;
    /**
     * Optional. An array of sites used to constrain the content accessible to the DA to just
     * the content identified via the items of array.
     */
    sites?: SiteElement[];
    /**
     * Optional. An array of objects that identify SharePoint or OneDrive sources using IDs.
     */
    items_by_sharepoint_ids?: ItemsBySharepointIDElement[];
    /**
     * Optional. An array of objects that identify SharePoint or OneDrive sources by URL.
     */
    items_by_url?: ItemsByURLElement[];
    /**
     * Optional. An array of objects that identify the Microsoft Graph connectors available to
     * the declarative agent
     */
    connections?: ConnectionElement[];
    /**
     * This member can be used to constrain the content accessible to the DA to just the content
     * identified via the members of each Teams url
     */
    urls?: URLElement[];
    /**
     * An array of Objects that represent the knowledge sources for the Dataverse in the
     * Declarative Agent
     */
    knowledge_sources?: KnowledgeSourceElement[];
    /**
     * A JSON array of Folder Object. This member can be used to constrain the content
     * accessible to the DA to just the emails present in the folders identified by members of
     * each Folder Object.
     */
    folders?: FolderElement[];
    /**
     * A JSON string that contains SMTP address of the shared mailbox. The presence of this
     * field indicates that the DA constrain its search for relevant emails only to that
     * mailbox. Emails from user's primary mailbox is not searched when this field is present.
     */
    shared_mailbox?: string;
    /**
     * A JSON array of strings containing SMTP addresses of group mailboxes. The presence of
     * this field indicates that the DA can search for relevant emails in the specified group
     * mailboxes. A maximum of 25 mailboxes are supported.
     */
    group_mailboxes?: string[];
    /**
     * A JSON boolean that indicates whether to include related content when searching people
     * data. When set to true, the DA will include related documents, emails, and Teams messages.
     */
    include_related_content?: boolean;
    /**
     * A list of Scenario Model objects denoting supported models
     */
    models?: ModelElement[];
    /**
     * Optional. An array of objects that identify meetings by their ICalUID.
     */
    items_by_id?: ItemsByIDElement[];
    /**
     * A JSON string identifier provisioned by an external file container storage service that
     * can be used to locate the embedded knowledge files.
     */
    embedded_resource_snapshot_id?: string;
    /**
     * A JSON array of file objects. List of objects identifying files that contain knowledge
     * the Agent can use for grounding. Maximum 10 files, max 1MB each.
     */
    files?: FileElement[];
    [property: string]: any;
}

/**
 * Identifies a Microsoft Graph connector.
 */
export interface ConnectionElement {
    /**
     * Required. Not localizable The unique identifier of the Microsoft Graph connector.
     */
    connection_id: string;
    /**
     * KQL based string containing the query filter
     */
    additional_search_terms?: string;
    /**
     * A list of objects to store urls for external items.
     */
    items_by_external_url?: ItemsByExternalURLElement[];
    /**
     * A list of objects to store identifiers for external items
     */
    items_by_external_id?: ItemsByExternalIDElement[];
    /**
     * A list of objects to store the container paths to items within a connection
     */
    items_by_path?: ItemsByPathElement[];
    /**
     * A list of objects to store containers names
     */
    items_by_container_name?: ItemsByContainerNameElement[];
    /**
     * A list of objects to store urls of containers
     */
    items_by_container_url?: ItemsByContainerURLElement[];
    [property: string]: any;
}

/**
 * Identifies an item by its container name.
 */
export interface ItemsByContainerNameElement {
    /**
     * A unique identifier for a container name
     */
    container_name: string;
    [property: string]: any;
}

/**
 * Identifies an item by its container URL.
 */
export interface ItemsByContainerURLElement {
    /**
     * Url for external graph connector item container
     */
    container_url: string;
    [property: string]: any;
}

/**
 * Identifies an item by its external ID.
 */
export interface ItemsByExternalIDElement {
    /**
     * A unique identifier for an external item.
     */
    item_id: string;
    [property: string]: any;
}

/**
 * Identifies an item by its external URL.
 */
export interface ItemsByExternalURLElement {
    /**
     * Url for external graph connector item.
     */
    url: string;
    [property: string]: any;
}

/**
 * Identifies an item by its path.
 */
export interface ItemsByPathElement {
    /**
     * A container path to an external item
     */
    path: string;
    [property: string]: any;
}

/**
 * A JSON object that identifies a file via the relative path.
 */
export interface FileElement {
    /**
     * A JSON string that contains the file relative path for the embedded file.
     */
    file: string;
    [property: string]: any;
}

export interface FolderElement {
    /**
     * A JSON string that identifies an email folder. This can either be id of the folder or one
     * of the well known names.
     */
    folder_id: string;
    [property: string]: any;
}

/**
 * A JSON object that identifies a meeting by its ICalUID.
 */
export interface ItemsByIDElement {
    /**
     * A JSON string that contains the ICalUID of a specific meeting.
     */
    id: string;
    /**
     * A JSON boolean that indicates whether the meeting is a series.
     */
    is_series: boolean;
    [property: string]: any;
}

/**
 * Contains one or more object identifiers that identify a SharePoint or OneDrive resource.
 */
export interface ItemsBySharepointIDElement {
    /**
     * Optional. Not localizable. The GUID identifier of a SharePoint or OneDrive site.
     */
    site_id?: string;
    /**
     * Optional. Not localizable. The GUID identifier of a SharePoint or OneDrive web.
     */
    web_id?: string;
    /**
     * Optional. Not localizable. The GUID identifier of a SharePoint or OneDrive list.
     */
    list_id?: string;
    /**
     * Optional. Not localizable. The GUID identifier of a SharePoint or OneDrive item.
     */
    unique_id?: string;
    /**
     * A JSON String that uniquely identifies a part of a SharePoint item. e.g a OneNote page.
     */
    part_id?: string;
    /**
     * A String that qualifies the kind of part that the "part_id" refers to. Currently this
     * value can only be equal to the string literal: "OneNotePart".
     */
    part_type?: "OneNotePart";
    /**
     * Boolean value indicating whether to enable searching associated sites. This value is only
     * applicable when the site_id value references a SharePoint HubSite.
     */
    search_associated_sites?: boolean;
}

/**
 * A String that qualifies the kind of part that the "part_id" refers to. Currently this
 * value can only be equal to the string literal: "OneNotePart".
 */

/**
 * Represents the URL of a SharePoint or OneDrive resource.
 */
export interface ItemsByURLElement {
    /**
     * Optional. Not localizable. An absolute URL to a SharePoint or OneDrive resource.
     */
    url?: string;
}

export interface KnowledgeSourceElement {
    /**
     * A unique identifier for the host in Dataverse.
     */
    host_name?: string;
    /**
     * A unique identifier that defines the configuration for how the copilot agent interacts
     * with Dataverse knowledge.
     */
    skill?: string;
    /**
     * An array of table_name objects which contain table names in DataVerse to scope the
     * knowledge of the Declarative Agent
     */
    tables?: TableElement[];
    [property: string]: any;
}

export interface TableElement {
    /**
     * A string to represent the table name.
     */
    table_name?: string;
    [property: string]: any;
}

/**
 * An Object representing a scenario model.
 */
export interface ModelElement {
    /**
     * A unique ID used to identify a Scenario Model
     */
    id: string;
    [property: string]: any;
}

export type Name = "WebSearch" | "GraphicArt" | "CodeInterpreter" | "OneDriveAndSharePoint" | "GraphConnectors" | "TeamsMessages" | "EmbeddedKnowledge" | "Email" | "EmailActions" | "People" | "Meetings" | "MeetingActions" | "Dataverse" | "ScenarioModels";

/**
 * An object that identifies a site used to constrain the content accessible to the
 * declarative agent.
 */
export interface SiteElement {
    /**
     * An absolute URL to a site.
     */
    url: string;
    [property: string]: any;
}

/**
 * Identifies a Teams channel, team or meeting chat
 */
export interface URLElement {
    /**
     * A string that contains a well formed, Teams url to a Teams channel, team or meeting chat
     * (join url)
     */
    url: string;
    [property: string]: any;
}

/**
 * Contains hints that are displayed to the user to demonstrate how they can get started
 * using the declarative agent.
 */
export interface ConversationStarterElement {
    /**
     * Required. Localizable. A suggestion that the user can use to obtain the desired result
     * from the DC. It MUST contain at least one nonwhitespace character.
     */
    text: string;
    /**
     * Optional. Localizable. A unique title for the conversation starter. It MUST contain at
     * least one nonwhitespace character.
     */
    title?: string;
    /**
     * Optional. A list of objects that specify dependencies for this conversation starter.
     */
    depends_on?: DependsOnElement[];
    [property: string]: any;
}

/**
 * An object that identifies a dependency for a conversation starter.
 */
export interface DependsOnElement {
    /**
     * Required. The identifier of the dependency.
     */
    id: string;
    /**
     * Required. The name of the dependency.
     */
    name: string;
    [property: string]: any;
}

/**
 * An optional JSON object containing a disclaimer message that, if provided, will be
 * displayed to users at the start of a conversation to satisfy legal or compliance
 * requirements. The object contains a required 'text' string property that MUST NOT be null
 * and MUST contain at least 1 non-whitespace character.
 */
export interface Disclaimer {
    /**
     * A JSON string that contains the disclaimer message. Characters beyond 500 MAY be ignored.
     */
    text: string;
    [property: string]: any;
}

/**
 * Optional. A JSON object that contains predefined question-answer pairs that the DA can
 * use to respond to user queries based on semantic similarity.
 *
 * A JSON object that contains either an answers array or url to define predefined
 * question-answer pairs for semantic matching and responses.
 */
export interface EditorialAnswers {
    /**
     * A JSON string containing a URL that locates a document containing the editorial answers
     * configuration.
     */
    url?: string;
    /**
     * A JSON array that contains a list of answer objects. There MUST NOT be more than 300
     * objects in this array.
     */
    answers?: AnswerElement[];
    [property: string]: any;
}

/**
 * A JSON object containing a predefined question-answer pair.
 */
export interface AnswerElement {
    /**
     * A JSON string containing the predefined question that will be used for semantic
     * similarity matching against user queries.
     */
    question: string;
    /**
     * A JSON string containing the predefined answer that will be returned when the user query
     * matches the question above the similarity threshold.
     */
    answer:                 string;
    similarity_thresholds?: SimilarityThresholds;
    [property: string]: any;
}

/**
 * A JSON object that contains the minimum and maximum similarity threshold values for
 * semantic matching.
 */
export interface SimilarityThresholds {
    /**
     * A JSON number that represents the minimum similarity threshold. The value MUST be a
     * number between 0 and 10 inclusive.
     */
    min: number;
    /**
     * A JSON number that represents the maximum similarity threshold. The value MUST be a
     * number between 0 and 10 inclusive.
     */
    max: number;
    [property: string]: any;
}

/**
 * Optional. A JSON object that specifies the sensitivity label for the DA.
 *
 * A JSON object that specifies the sensitivity label for the DA. The GUID should match one
 * of the published sensitivity labels within the tenant.
 */
export interface SensitivityLabel {
    /**
     * Required. The GUID of the sensitivity label pulled from the Purview API.
     */
    id: string;
    [property: string]: any;
}

/**
 * A JSON object that allows the DA author to specify the path of a capability that can be
 * modified and a set of allowed_actions for those capabilities.
 */
export interface UserOverrideElement {
    /**
     * A JSON string that contains a JSONPath expression identifying the capability or
     * configuration element that users can modify.
     */
    path: string;
    /**
     * A JSON array of strings that specifies what actions can be taken for the specified path.
     * The only supported action is 'remove'.
     */
    allowed_actions: "remove"[];
    [property: string]: any;
}

/**
 * A JSON object used to identify a declarative agent to act as a worker agent.
 */
export interface WorkerAgentElement {
    /**
     * A JSON string that is a unique identifier for a Declarative Agent.
     */
    id?: string;
    /**
     * A JSON string that is a relative file path to a Declarative Agent manifest for the worker
     * agent.
     */
    file?: string;
    [property: string]: any;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toDeclarativeAgentManifestV1D9(json: string): DeclarativeAgentManifestV1D9 {
        return cast(JSON.parse(json), r("DeclarativeAgentManifestV1D9"));
    }

    public static declarativeAgentManifestV1D9ToJson(value: DeclarativeAgentManifestV1D9): string {
        return JSON.stringify(uncast(value, r("DeclarativeAgentManifestV1D9")), null, 4);
    }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ''): never {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : '';
    const keyText = key ? ` for key "${key}"` : '';
    throw Error(`Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(val)}`);
}

function prettyTypeName(typ: any): string {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ.map(a => { return prettyTypeName(a); }).join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ: any): any {
    if (typ.jsonToJS === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.json] = { key: p.js, typ: p.typ });
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
    if (typ.jsToJSON === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.js] = { key: p.json, typ: p.typ });
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(val: any, typ: any, getProps: any, key: any = '', parent: any = ''): any {
    function transformPrimitive(typ: string, val: any): any {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs: any[], val: any): any {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) {}
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases: string[], val: any): any {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(cases.map(a => { return l(a); }), val, key, parent);
    }

    function transformArray(typ: any, val: any): any {
        // val must be an array with no invalid elements
        if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
        return val.map(el => transform(el, typ, getProps));
    }

    function transformDate(val: any): any {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(props: { [k: string]: any }, additional: any, val: any): any {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result: any = {};
        Object.getOwnPropertyNames(props).forEach(key => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(val[key], additional, getProps, key, ref);
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref: any = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers") ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems")    ? transformArray(typ.arrayItems, val)
            : typ.hasOwnProperty("props")         ? transformObject(getProps(typ), typ.additional, val)
            : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
    return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
    return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
    return { literal: typ };
}

function a(typ: any) {
    return { arrayItems: typ };
}

function u(...typs: any[]) {
    return { unionMembers: typs };
}

function o(props: any[], additional: any) {
    return { props, additional };
}

function m(additional: any) {
    return { props: [], additional };
}

function r(name: string) {
    return { ref: name };
}

const typeMap: any = {
    "DeclarativeAgentManifestV1D9": o([
        { json: "version", js: "version", typ: r("Version") },
        { json: "id", js: "id", typ: u(undefined, "") },
        { json: "name", js: "name", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "disclaimer", js: "disclaimer", typ: u(undefined, r("Disclaimer")) },
        { json: "instructions", js: "instructions", typ: u(undefined, "") },
        { json: "behavior_overrides", js: "behavior_overrides", typ: u(undefined, r("BehaviorOverrides")) },
        { json: "capabilities", js: "capabilities", typ: u(undefined, a(r("CapabilityElement"))) },
        { json: "conversation_starters", js: "conversation_starters", typ: u(undefined, a(r("ConversationStarterElement"))) },
        { json: "actions", js: "actions", typ: u(undefined, a(r("ActionElement"))) },
        { json: "user_overrides", js: "user_overrides", typ: u(undefined, a(r("UserOverrideElement"))) },
        { json: "editorial_answers", js: "editorial_answers", typ: u(undefined, r("EditorialAnswers")) },
        { json: "worker_agents", js: "worker_agents", typ: u(undefined, a(r("WorkerAgentElement"))) },
        { json: "sensitivity_label", js: "sensitivity_label", typ: u(undefined, r("SensitivityLabel")) },
        { json: "agent_skills", js: "agent_skills", typ: u(undefined, a(r("AgentSkillElement"))) },
    ], "any"),
    "ActionElement": o([
        { json: "id", js: "id", typ: "" },
        { json: "file", js: "file", typ: "" },
    ], "any"),
    "AgentSkillElement": o([
        { json: "folder", js: "folder", typ: "" },
    ], "any"),
    "BehaviorOverrides": o([
        { json: "special_instructions", js: "special_instructions", typ: u(undefined, r("SpecialInstructions")) },
        { json: "suggestions", js: "suggestions", typ: u(undefined, r("Suggestions")) },
        { json: "default_response_mode", js: "default_response_mode", typ: u(undefined, r("DefaultResponseMode")) },
    ], "any"),
    "SpecialInstructions": o([
        { json: "discourage_model_knowledge", js: "discourage_model_knowledge", typ: u(undefined, true) },
    ], "any"),
    "Suggestions": o([
        { json: "disabled", js: "disabled", typ: u(undefined, true) },
    ], "any"),
    "CapabilityElement": o([
        { json: "name", js: "name", typ: r("Name") },
        { json: "sites", js: "sites", typ: u(undefined, a(r("SiteElement"))) },
        { json: "items_by_sharepoint_ids", js: "items_by_sharepoint_ids", typ: u(undefined, a(r("ItemsBySharepointIDElement"))) },
        { json: "items_by_url", js: "items_by_url", typ: u(undefined, a(r("ItemsByURLElement"))) },
        { json: "connections", js: "connections", typ: u(undefined, a(r("ConnectionElement"))) },
        { json: "urls", js: "urls", typ: u(undefined, a(r("URLElement"))) },
        { json: "knowledge_sources", js: "knowledge_sources", typ: u(undefined, a(r("KnowledgeSourceElement"))) },
        { json: "folders", js: "folders", typ: u(undefined, a(r("FolderElement"))) },
        { json: "shared_mailbox", js: "shared_mailbox", typ: u(undefined, "") },
        { json: "group_mailboxes", js: "group_mailboxes", typ: u(undefined, a("")) },
        { json: "include_related_content", js: "include_related_content", typ: u(undefined, true) },
        { json: "models", js: "models", typ: u(undefined, a(r("ModelElement"))) },
        { json: "items_by_id", js: "items_by_id", typ: u(undefined, a(r("ItemsByIDElement"))) },
        { json: "embedded_resource_snapshot_id", js: "embedded_resource_snapshot_id", typ: u(undefined, "") },
        { json: "files", js: "files", typ: u(undefined, a(r("FileElement"))) },
    ], "any"),
    "ConnectionElement": o([
        { json: "connection_id", js: "connection_id", typ: "" },
        { json: "additional_search_terms", js: "additional_search_terms", typ: u(undefined, "") },
        { json: "items_by_external_url", js: "items_by_external_url", typ: u(undefined, a(r("ItemsByExternalURLElement"))) },
        { json: "items_by_external_id", js: "items_by_external_id", typ: u(undefined, a(r("ItemsByExternalIDElement"))) },
        { json: "items_by_path", js: "items_by_path", typ: u(undefined, a(r("ItemsByPathElement"))) },
        { json: "items_by_container_name", js: "items_by_container_name", typ: u(undefined, a(r("ItemsByContainerNameElement"))) },
        { json: "items_by_container_url", js: "items_by_container_url", typ: u(undefined, a(r("ItemsByContainerURLElement"))) },
    ], "any"),
    "ItemsByContainerNameElement": o([
        { json: "container_name", js: "container_name", typ: "" },
    ], "any"),
    "ItemsByContainerURLElement": o([
        { json: "container_url", js: "container_url", typ: "" },
    ], "any"),
    "ItemsByExternalIDElement": o([
        { json: "item_id", js: "item_id", typ: "" },
    ], "any"),
    "ItemsByExternalURLElement": o([
        { json: "url", js: "url", typ: "" },
    ], "any"),
    "ItemsByPathElement": o([
        { json: "path", js: "path", typ: "" },
    ], "any"),
    "FileElement": o([
        { json: "file", js: "file", typ: "" },
    ], "any"),
    "FolderElement": o([
        { json: "folder_id", js: "folder_id", typ: "" },
    ], "any"),
    "ItemsByIDElement": o([
        { json: "id", js: "id", typ: "" },
        { json: "is_series", js: "is_series", typ: true },
    ], "any"),
    "ItemsBySharepointIDElement": o([
        { json: "site_id", js: "site_id", typ: u(undefined, "") },
        { json: "web_id", js: "web_id", typ: u(undefined, "") },
        { json: "list_id", js: "list_id", typ: u(undefined, "") },
        { json: "unique_id", js: "unique_id", typ: u(undefined, "") },
        { json: "part_id", js: "part_id", typ: u(undefined, "") },
        { json: "part_type", js: "part_type", typ: u(undefined, r("PartType")) },
        { json: "search_associated_sites", js: "search_associated_sites", typ: u(undefined, true) },
    ], false),
    "ItemsByURLElement": o([
        { json: "url", js: "url", typ: u(undefined, "") },
    ], false),
    "KnowledgeSourceElement": o([
        { json: "host_name", js: "host_name", typ: u(undefined, "") },
        { json: "skill", js: "skill", typ: u(undefined, "") },
        { json: "tables", js: "tables", typ: u(undefined, a(r("TableElement"))) },
    ], "any"),
    "TableElement": o([
        { json: "table_name", js: "table_name", typ: u(undefined, "") },
    ], "any"),
    "ModelElement": o([
        { json: "id", js: "id", typ: "" },
    ], "any"),
    "SiteElement": o([
        { json: "url", js: "url", typ: "" },
    ], "any"),
    "URLElement": o([
        { json: "url", js: "url", typ: "" },
    ], "any"),
    "ConversationStarterElement": o([
        { json: "text", js: "text", typ: "" },
        { json: "title", js: "title", typ: u(undefined, "") },
        { json: "depends_on", js: "depends_on", typ: u(undefined, a(r("DependsOnElement"))) },
    ], "any"),
    "DependsOnElement": o([
        { json: "id", js: "id", typ: "" },
        { json: "name", js: "name", typ: "" },
    ], "any"),
    "Disclaimer": o([
        { json: "text", js: "text", typ: "" },
    ], "any"),
    "EditorialAnswers": o([
        { json: "url", js: "url", typ: u(undefined, "") },
        { json: "answers", js: "answers", typ: u(undefined, a(r("AnswerElement"))) },
    ], "any"),
    "AnswerElement": o([
        { json: "question", js: "question", typ: "" },
        { json: "answer", js: "answer", typ: "" },
        { json: "similarity_thresholds", js: "similarity_thresholds", typ: u(undefined, r("SimilarityThresholds")) },
    ], "any"),
    "SimilarityThresholds": o([
        { json: "min", js: "min", typ: 3.14 },
        { json: "max", js: "max", typ: 3.14 },
    ], "any"),
    "SensitivityLabel": o([
        { json: "id", js: "id", typ: "" },
    ], "any"),
    "UserOverrideElement": o([
        { json: "path", js: "path", typ: "" },
        { json: "allowed_actions", js: "allowed_actions", typ: a(r("AllowedAction")) },
    ], "any"),
    "WorkerAgentElement": o([
        { json: "id", js: "id", typ: u(undefined, "") },
        { json: "file", js: "file", typ: u(undefined, "") },
    ], "any"),
    "DefaultResponseMode": [
        "Auto",
        "Quick response",
        "Think deeper",
    ],
    "PartType": [
        "OneNotePart",
    ],
    "Name": [
        "CodeInterpreter",
        "Dataverse",
        "Email",
        "EmailActions",
        "EmbeddedKnowledge",
        "GraphConnectors",
        "GraphicArt",
        "MeetingActions",
        "Meetings",
        "OneDriveAndSharePoint",
        "People",
        "ScenarioModels",
        "TeamsMessages",
        "WebSearch",
    ],
    "AllowedAction": [
        "remove",
    ],
    "Version": [
        "v1.9",
    ],
};
