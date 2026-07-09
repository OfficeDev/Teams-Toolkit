// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "./sampleFilter.scss";

import { debounce } from "lodash";
import * as React from "react";

import {
  Button,
  Dropdown,
  Option,
  type OptionOnSelectData,
  type SelectionEvents,
} from "@fluentui/react-components";
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";

import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetryTriggerFrom,
} from "../../telemetry/extTelemetryEvents";
import { Commands } from "../Commands";
import { Grid } from "../resources";
import { SampleFilterProps } from "./ISamples";

export default class SampleFilter extends React.Component<SampleFilterProps, unknown> {
  constructor(props: SampleFilterProps) {
    super(props);
  }

  render() {
    const sampleTypes = this.props.filterOptions.capabilities;
    const sampleLanguages = this.props.filterOptions.languages;
    const sampleTechniques = this.props.filterOptions.technologies;
    const typeOptions = sampleTypes.map((type) => {
      const count = this.props.samples.filter((sample) => {
        return sample.types && sample.types.indexOf(type) >= 0;
      }).length;
      return { key: type, text: `${type} (${count})` };
    });
    const languageOptions = sampleLanguages.map((type) => {
      return { key: type, text: type };
    });
    const techniqueOptions = sampleTechniques.map((type) => {
      return { key: type, text: type };
    });
    const selectedTypes = sampleTypes.filter((type) => this.props.filterTags.indexOf(type) >= 0);
    const selectedLanguages = sampleLanguages.filter(
      (type) => this.props.filterTags.indexOf(type) >= 0
    );
    const selectedTechniques = sampleTechniques.filter(
      (type) => this.props.filterTags.indexOf(type) >= 0
    );

    return (
      <div className="sample-filter">
        <div className="sample-filter-bar">
          <VSCodeTextField
            className="search-box"
            placeholder="Search samples"
            value={this.props.query}
            onInput={this.onSearchTextChanged}
          >
            <span slot="start" className="codicon codicon-search"></span>
          </VSCodeTextField>
          <Dropdown
            className="sample-dropdown"
            aria-label="Select to filter platform capability:"
            placeholder="Platform capability"
            size="small"
            multiselect
            selectedOptions={selectedTypes}
            value={this.getDropdownValue(selectedTypes)}
            listbox={{ className: "sample-dropdown-listbox" }}
            onOptionSelect={this.onFilterTagsChanged}
          >
            {typeOptions.map((option) => (
              <Option key={option.key} value={option.key} text={option.text}>
                {option.text}
              </Option>
            ))}
          </Dropdown>
          <Dropdown
            className="sample-dropdown"
            aria-label="Select to filter programming language:"
            placeholder="Language"
            size="small"
            multiselect
            selectedOptions={selectedLanguages}
            value={this.getDropdownValue(selectedLanguages)}
            listbox={{ className: "sample-dropdown-listbox" }}
            onOptionSelect={this.onFilterTagsChanged}
          >
            {languageOptions.map((option) => (
              <Option key={option.key} value={option.key} text={option.text}>
                {option.text}
              </Option>
            ))}
          </Dropdown>
          <Dropdown
            className="sample-dropdown"
            aria-label="Select to filter technology:"
            placeholder="Technology"
            size="small"
            multiselect
            selectedOptions={selectedTechniques}
            value={this.getDropdownValue(selectedTechniques)}
            listbox={{ className: "sample-dropdown-listbox" }}
            onOptionSelect={this.onFilterTagsChanged}
          >
            {techniqueOptions.map((option) => (
              <Option key={option.key} value={option.key} text={option.text}>
                {option.text}
              </Option>
            ))}
          </Dropdown>
          <div className="filter-bar"></div>
          <VSCodeButton
            onClick={() => this.props.onLayoutChanged("grid")}
            appearance="icon"
            aria-label={this.props.layout === "grid" ? "Gallery view, selected" : "Gallery view"}
            aria-pressed={this.props.layout === "grid"}
            className={`layout-button ${this.props.layout === "grid" ? "layout-selected" : ""}`}
          >
            <Grid />
          </VSCodeButton>
          <VSCodeButton
            onClick={() => this.props.onLayoutChanged("list")}
            appearance="icon"
            aria-label={this.props.layout === "list" ? "List view, selected" : "List view"}
            aria-pressed={this.props.layout === "list"}
            className={`layout-button ${this.props.layout === "list" ? "layout-selected" : ""}`}
          >
            <span className="codicon codicon-list-unordered"></span>
          </VSCodeButton>
        </div>
        <div className="filter-tag-bar">
          {this.props.filterTags.map((tag) => (
            <div className="filter-tag" key={tag}>
              <span>{tag}</span>
              <span
                className="codicon codicon-close"
                role="button"
                tabIndex={0}
                aria-label={`Remove ${tag} filter`}
                onClick={() => this.onTagRemoved(tag)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    this.onTagRemoved(tag);
                  }
                }}
              ></span>
            </div>
          ))}
          {this.props.filterTags.length > 0 && (
            <Button appearance="subtle" onClick={this.onAllTagsRemoved}>
              Clear all
            </Button>
          )}
        </div>
      </div>
    );
  }

  private onSearchTextChanged = (e: { target: { value: string } }) => {
    debounce(() => {
      vscode.postMessage({
        command: Commands.SendTelemetryEvent,
        data: {
          eventName: TelemetryEvent.SearchSample,
          properties: {
            [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.SampleGallery,
            [TelemetryProperty.SearchText]: e.target.value,
            [TelemetryProperty.SampleFilters]: this.props.filterTags.join(","),
          },
        },
      });
      this.props.onFilterConditionChanged(e.target.value, this.props.filterTags);
    }, 500)();
  };

  private onFilterTagChanged = (
    telemetryEvent: TelemetryEvent,
    changedFilter: string,
    newFilterTags: string[]
  ) => {
    vscode.postMessage({
      command: Commands.SendTelemetryEvent,
      data: {
        eventName: telemetryEvent,
        properties: {
          [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.SampleGallery,
          [TelemetryProperty.ChangedFilter]: changedFilter,
          [TelemetryProperty.SampleFilters]: this.props.filterTags.join(","),
        },
      },
    });
    this.props.onFilterConditionChanged(this.props.query, newFilterTags);
  };

  private onFilterTagsChanged = (_event: SelectionEvents, data: OptionOnSelectData) => {
    const choice = data.optionValue;
    if (!choice) {
      return;
    }

    let telemetryEvent = TelemetryEvent.FilterSampleAdd;
    let newData: string[] = [];
    if (data.selectedOptions.includes(choice)) {
      newData = [...this.props.filterTags, choice];
    } else {
      telemetryEvent = TelemetryEvent.FilterSampleRemove;
      newData = this.props.filterTags.filter((tag) => tag !== choice);
    }
    this.onFilterTagChanged(telemetryEvent, choice, newData);
  };

  private getDropdownValue = (selectedOptions: string[]) => {
    return selectedOptions.length > 0 ? selectedOptions.join(", ") : undefined;
  };

  private onTagRemoved = (removedTag: string) => {
    vscode.postMessage({
      command: Commands.SendTelemetryEvent,
      data: {
        eventName: TelemetryEvent.FilterSampleRemove,
        properties: {
          [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.SampleGallery,
          [TelemetryProperty.ChangedFilter]: removedTag,
          [TelemetryProperty.SampleFilters]: this.props.filterTags.join(","),
        },
      },
    });
    const newFilterTags = this.props.filterTags.filter((tag) => tag !== removedTag);
    this.props.onFilterConditionChanged(this.props.query, newFilterTags);
  };

  private onAllTagsRemoved = () => {
    vscode.postMessage({
      command: Commands.SendTelemetryEvent,
      data: {
        eventName: TelemetryEvent.FilterSampleRemove,
        properties: {
          [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.SampleGallery,
          [TelemetryProperty.ChangedFilter]: this.props.filterTags.join(","),
          [TelemetryProperty.SampleFilters]: this.props.filterTags.join(","),
        },
      },
    });
    this.props.onFilterConditionChanged(this.props.query, []);
  };
}
