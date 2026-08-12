{
  "component": {
    "version": 1,
    "id": "regenerateDaActionSelectFindByStatus",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_regenerateDaActionSelectFindByStatus_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Select operation(s) Copilot can interact with multi-select prompt is visible with GET /pet/findByStatus selectable.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:multiSelect",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_regenerateDaActionSelectFindByStatus_select_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 235,
        "y": 258
      },
      "description": "Click the recorded GET /pet/findByStatus option.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_regenerateDaActionSelectFindByStatus_assert_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:235:258:16:5:0c64c48494242820",
        "dhash:235:258:96:5:9d6d6d7c7d6d667d",
        "dhash:235:258:0:10:64444044236a6421"
      ],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    },
    {
      "step_id": "step_regenerateDaActionSelectFindByStatus_confirm_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 799,
        "y": 50
      },
      "description": "Click the recorded OK button to confirm GET /pet/findByStatus.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_regenerateDaActionSelectFindByStatus_select_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:799:50:16:5:69b5c549a5916da5",
        "dhash:799:50:96:5:3212d22222c22292",
        "dhash:799:50:0:10:64c4404523636421"
      ],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    }
  ]
}
