import * as React from "react";
import * as ReactDOM from "react-dom";
import { IntlProvider } from "react-intl";
import { initializeIcons } from "@fluentui/react/lib/Icons";
import { ActionButton } from "@fluentui/react";
import "./tree.scss";
import publish_dark from "../../media/dark/publish.svg";
import publish_light from "../../media/light/publish.svg";
import developerPortal_dark from "../../media/dark/developerPortal.svg";
import developerPortal_light from "../../media/light/developerPortal.svg";

const language = "en";

class App extends React.Component {
  constructor(props: any) {
    super(props);
    // Initializing the office-ui-fabric-icons here to avoid multiple initializations in every component.
    initializeIcons();
  }

  render() {
    return (
      <div>
        <TreeItem
          name="Provision in the cloud"
          icon="codicon codicon-type-hierarchy"
          customized={false}
          disable={false}
        ></TreeItem>
        <TreeItem
          name="Validate manifest file"
          icon="codicon codicon-checklist"
          customized={false}
          disable={true}
        ></TreeItem>
        <TreeItem
          name="Zip Teams metadata package"
          icon="codicon codicon-package"
          customized={false}
          disable={true}
        ></TreeItem>
        <TreeItem
          name="Deploy to the cloud"
          icon="codicon codicon-cloud-upload"
          customized={false}
          disable={true}
        ></TreeItem>
        <TreeItem
          name="Publish to Teams"
          icon={publish_dark}
          customized={true}
          disable={true}
        ></TreeItem>
        <TreeItem
          name="Developer Portal for Teams"
          icon={developerPortal_dark}
          customized={true}
          disable={true}
        ></TreeItem>
        <TreeItem
          name="CI/CD guide"
          icon="codicon codicon-sync"
          customized={false}
          disable={true}
        ></TreeItem>
      </div>
    );
  }
}

class TreeItem extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
  }

  render() {
    if (this.props.customized) {
      const iconName = this.props.icon as string;
      return (
        <div className="row">
          <ActionButton allowDisabledFocus disabled={this.props.disable}>
            <img src={this.props.icon}></img>
            {this.props.name}
          </ActionButton>
        </div>
      );
    } else {
      return (
        <div className="row">
          <ActionButton allowDisabledFocus disabled={this.props.disable}>
            <div className={this.props.icon}></div>
            {this.props.name}
          </ActionButton>
        </div>
      );
    }
  }
}

ReactDOM.render(
  <IntlProvider locale={language}>
    <App />
  </IntlProvider>,
  document.getElementById("root") as HTMLElement
);
