/**
 * -------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation.  All Rights Reserved.  Licensed under the MIT License.
 * See License in the project root for license information.
 * -------------------------------------------------------------------------------------------
 */

/**
 * @module LongRunningOperationMiddleware
 */

import { Context, Middleware } from "@microsoft/microsoft-graph-client";

/**
 * @class
 * @implements Middleware
 * Class representing LongRunningOperationMiddleware
 */
export class LongRunningOperationMiddleware implements Middleware {
  /**
   * @private
   * A member representing the location header name
   */
  private static LOCATION_HEADER = "Location";

  /**
   * @private
   * A member to hold next middleware in the middleware chain
   */
  private nextMiddleware: Middleware;

  /**
   * @private
   * A member to hold the delay in milliseconds
   */
  private delay: number;

  /**
   * @public
   * @constructor
   * Creates an instance of LongRunningOperationMiddleware
   * @param {number} delay - The delay in  milliseconds between each retries for the long-running operation
   */
  public constructor(delay: number) {
    this.delay = delay;
  }

  /**
   * @public
   * @async
   * To execute the current middleware
   * @param {Context} context - The context object of the request
   * @returns A Promise that resolves to nothing
   */
  public async execute(context: Context): Promise<void> {
    if (context) {
      // wait for response
      await this.nextMiddleware.execute(context);

      const location = context.response!.headers.get(
        LongRunningOperationMiddleware.LOCATION_HEADER
      );
      if (location) {
        if (location.indexOf("/operations/") < 0) {
          // not a job URL we should follow
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, this.delay));

        context.request = location;
        context.options!.method = "GET";
        context.options!.body = undefined;
        await this.execute(context);
        return;
      }

      if (context.request.toString().indexOf("/operations/") < 0) {
        // not a job
        return;
      }

      const res = context.response!.clone();
      if (!res.ok) {
        return;
      }

      const body: any = await res.json();
      if (body.status === "inprogress") {
        await new Promise((resolve) => setTimeout(resolve, this.delay));
        await this.execute(context);
      }
    }
  }

  /**
   * @public
   * To set the next middleware in the chain
   * @param {Middleware} next - The middleware instance
   * @returns Nothing
   */
  public setNext(next: Middleware): void {
    this.nextMiddleware = next;
  }
}
