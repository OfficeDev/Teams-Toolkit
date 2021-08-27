//@ts-check

"use strict";

const path = require("path");
const HtmlWebPackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");
const CopyPlugin = require("copy-webpack-plugin");
const terserWebpackPlugin = require("terser-webpack-plugin");

/**@type {import('webpack').Configuration}*/
const config = {
  target: "node", // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
  //mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  node: {
    __dirname: false,
  },

  entry: {
    extension: "./src/extension.ts", // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    client: "./src/controls/index.tsx",
    tree: "./src/controls/tree.tsx",
  },
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, "out/src"),
    libraryTarget: "umd",
    devtoolModuleFilenameTemplate: "../[resource-path]",
    umdNamedDefine: true,
    globalObject: `(typeof self !== 'undefined' ? self : this)`,
  },
  devtool: "source-map",
  externals: {
    vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    keytar: "keytar",
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: [".tsx", ".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /(?<!\.d)\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
      {
        test: /\.s[ac]ss$/i,
        exclude: /node_modules/,
        use: ["style-loader", "css-loader", "sass-loader"],
      },
      {
        test: /\.(jpg|png|svg|gif)$/,
        use: {
          loader: "url-loader",
        },
      },
    ],
  },
  plugins: [
    new HtmlWebPackPlugin({
      template: "./src/commonlib/codeFlowResult/index.html",
      filename: "codeFlowResult/index.html",
    }),
    new webpack.ContextReplacementPlugin(/express[\/\\]lib/, false, /$^/),
    new webpack.ContextReplacementPlugin(
      /applicationinsights[\/\\]out[\/\\]AutoCollection/,
      false,
      /$^/
    ),
    new webpack.ContextReplacementPlugin(/applicationinsights[\/\\]out[\/\\]Library/, false, /$^/),
    new webpack.ContextReplacementPlugin(/ms-rest[\/\\]lib/, false, /$^/),
    new webpack.IgnorePlugin({ resourceRegExp: /@opentelemetry\/tracing/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /applicationinsights-native-metrics/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /original-fs/ }),
    new CopyPlugin({
      patterns: [
        {
          from: "./src/debug/depsChecker/resource/dotnet-install.sh",
          to: "resource/dotnet-install.sh",
        },
        {
          from: "./src/debug/depsChecker/resource/dotnet-install.ps1",
          to: "resource/dotnet-install.ps1",
        },
        {
          from: "../fx-core/resource/",
          to: "../resource/",
        },
        {
          from: "../fx-core/templates/",
          to: "../templates/",
        },
      ],
    }),
  ],
  optimization: {
    minimizer: [
      new terserWebpackPlugin({
        terserOptions: {
          mangle: false,
          keep_fnames: true,
        },
      }),
    ],
  },
};
module.exports = config;
