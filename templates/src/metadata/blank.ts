// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { TemplateAlias, TemplateNames } from "../templateNames";
import { Template } from "./interface";

export const blankTemplates: Template[] = [
  {
    id: "blank-app",
    name: TemplateNames.BlankApp,
    alias: TemplateAlias.BlankApp,
    language: "common",
    displayName: "Blank App",
    description: "Blank M365 app with minimal structure",
  },
];
