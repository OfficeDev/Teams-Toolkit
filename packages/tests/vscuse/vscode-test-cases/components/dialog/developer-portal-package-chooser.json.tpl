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
      "description": "@assertion the native package file chooser is visible with appPackage selectable and Open as its primary action.",
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
      "step_id": "step_developerPortalPackageChooser_appPackage_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 344,
        "y": 83
      },
      "description": "Click the recorded appPackage folder in the native file chooser.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_developerPortalPackageChooser_assert_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:344:83:16:5:0000000000000000",
        "dhash:344:83:96:5:0000000000000000",
        "dhash:344:83:0:10:0e60c0d1c0c0c240"
      ],
      "postconditions": [],
      "tags": ["component:dialog", "action:select-package"]
    },
    {
      "step_id": "step_developerPortalPackageChooser_openAppPackage_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 980,
        "y": 748
      },
      "description": "Click Open to enter the recorded appPackage selection.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_developerPortalPackageChooser_appPackage_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:980:748:16:5:cc541555cd32cc00",
        "dhash:980:748:96:5:6e9105e09c9cd021",
        "dhash:980:748:0:10:0e60c0d1c0c0c240"
      ],
      "postconditions": [],
      "tags": ["component:dialog", "action:select-package"]
    },
    {
      "step_id": "step_developerPortalPackageChooser_openBuild_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 980,
        "y": 748
      },
      "description": "Click Open to enter the recorded build selection.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_developerPortalPackageChooser_openAppPackage_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:980:748:16:5:cc541555cd32cc00",
        "dhash:980:748:96:5:6e9105e09c9cd021",
        "dhash:980:748:0:10:2688c0e1c0c0c240"
      ],
      "postconditions": [],
      "tags": ["component:dialog", "action:select-package"]
    },
    {
      "step_id": "step_developerPortalPackageChooser_openZip_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 980,
        "y": 748
      },
      "description": "Click Open to choose the recorded appPackage.local.zip file.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_developerPortalPackageChooser_openBuild_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:980:748:16:5:cc541555cd32cc00",
        "dhash:980:748:96:5:6e9105e09c9cd021",
        "dhash:980:748:0:10:0688c0c2c0c0c240"
      ],
      "postconditions": [],
      "tags": ["component:dialog", "action:select-package"]
    }
  ]
}
