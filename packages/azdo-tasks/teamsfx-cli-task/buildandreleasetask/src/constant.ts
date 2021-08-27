// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/* eslint-disable @typescript-eslint/no-extraneous-class */
import path from 'path'

export class Commands {
  static readonly TeamsfxCliName: string = 'npx teamsfx'
  static readonly AddOptionPrefix = (optionName: string): string =>
    `--${optionName}`
  static readonly NpmInstall: string = 'npm install'
}

export function TeamsfxCliPath(workdir: string = '.') {
  return path.join(workdir, 'node_modules', '@microsoft', 'teamsfx-cli')
}
