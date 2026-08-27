{
  "component": {
    "version": 1,
    "id": "developerPortalPackageChooser",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_developerPortalPackageChooser_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the native package file chooser is visible and ready for a package path.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:dialog",
        "action:select-package",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_developerPortalPackageChooser_openLocation_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": {
        "keys": "ctrl+l"
      },
      "description": "Open the native file chooser Location field with Ctrl+L.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_developerPortalPackageChooser_assert_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:dialog", "action:select-package"]
    },
    {
      "step_id": "step_developerPortalPackageChooser_typeLocation_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "/home/vscode/AgentsToolkitProjects/${{var:app_name}}/appPackage/build/appPackage.local.zip"
      },
      "description": "Type the exact local app package path into the native file chooser Location field.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_developerPortalPackageChooser_openLocation_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:dialog", "action:select-package"]
    },
    {
      "step_id": "step_developerPortalPackageChooser_assertLocation_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the native package file chooser Location field visibly contains exactly /home/vscode/AgentsToolkitProjects/${{var:app_name}}/appPackage/build/appPackage.local.zip and is ready to submit that path.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_developerPortalPackageChooser_typeLocation_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:dialog",
        "action:select-package",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_developerPortalPackageChooser_submitLocation_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": {
        "keys": "alt+o"
      },
      "description": "Use the native file chooser Open mnemonic to submit the verified local app package path.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_developerPortalPackageChooser_assertLocation_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:dialog", "action:select-package"]
    }
  ]
}
