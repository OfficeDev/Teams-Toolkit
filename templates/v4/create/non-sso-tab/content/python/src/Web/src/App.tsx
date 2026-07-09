import React from "react";
import * as teamsJs from "@microsoft/teams-js";

import "./App.css";

export default function App() {
  const [content, setContent] = React.useState("");

  React.useEffect(() => {
    (async () => {
      teamsJs.app.initialize().then(() => {
        teamsJs.app.getContext().then((context: teamsJs.app.Context) => {
          if (context?.app?.host?.name) {
            setContent(`Your app is running in ${context.app.host.name}`);
          }
        });
      });
    })();
  }, []);

  return (
    <div className="App">
      <h1>👋 Welcome</h1>

      {content && (
        <div className="result">
          <pre>
            <code>{content}</code>
          </pre>
        </div>
      )}

      <p>
        For more information, please refer to the{" "}
        <a href="https://aka.ms/teams-ai-library-v2" rel="noopener noreferrer" target="_blank">
          Microsoft Teams SDK
        </a>
        .
      </p>
    </div>
  );
}
