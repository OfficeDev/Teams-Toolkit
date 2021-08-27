// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { MultiValueOptions } from "./enums/multiValueOptions";
import { SingleValueOptions } from "./enums/singleValueOptions";

export namespace OptionMap {
    export const optionMap: { [key: string]: Array<string> } = {
        account: [SingleValueOptions.Action],
        new: [SingleValueOptions.Interactive, SingleValueOptions.Scratch, MultiValueOptions.Capabilities, SingleValueOptions.HostType, SingleValueOptions.SpfxFrameworkType, SingleValueOptions.SpfxWebpartDesp,
        SingleValueOptions.SpfxWebpartName, MultiValueOptions.AzureResources, SingleValueOptions.WayToRegisterBot, SingleValueOptions.BotId, SingleValueOptions.BotPassword,
        SingleValueOptions.ProgrammingLanguage, SingleValueOptions.Folder, SingleValueOptions.AppName, SingleValueOptions.Samples
        ],
        capability: [],
        resource: [],
        provision: [
            SingleValueOptions.Subscription, SingleValueOptions.SqlAdminName, SingleValueOptions.SqlPassword,
            SingleValueOptions.Folder
        ],
        deploy: [
            SingleValueOptions.OpenApiDocument, SingleValueOptions.ApiPrefix, SingleValueOptions.ApiVersion,
            SingleValueOptions.Folder
        ],
        init: [
            SingleValueOptions.AppName, SingleValueOptions.Environment, SingleValueOptions.Endpoint,
            SingleValueOptions.RootPath
        ],
        build: [
            SingleValueOptions.Folder
        ],
        validate: [
            SingleValueOptions.Folder
        ],
        publish: [
            SingleValueOptions.Folder
        ],
        config: [
            SingleValueOptions.Folder
        ]
    }

    export function validOptionInCommand(command: string, option: string): boolean {
        const result = optionMap[command]?.includes(option)
        return result === undefined ? false : result
    }
}
