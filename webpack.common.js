const { merge } = require('webpack-merge');
const path = require('path');

const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const MiniCssExtractPluginConfig = new MiniCssExtractPlugin({
  filename: '[name].[contenthash].css',
  chunkFilename: '[id].[contenthash].css',
});

//https://webpack.js.org/plugins/html-webpack-plugin/
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HTMLWebpackPluginConfig = new HtmlWebpackPlugin({
  template: path.resolve(__dirname, 'src', 'index.html'),
  filename: 'index.html',
  inject: 'body',
  minify: {
    collapseWhitespace: true,
    minifyCSS: true,
  },
});

const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CleanupPluginConfig = new CleanWebpackPlugin({});

const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');
const MonacoWebpackPluginConfig = new MonacoWebpackPlugin({
  languages: [
    'shell', 'c', 'cpp', 'csharp', 'go', 'java', 'julia', 'kotlin', 'lua', 'javascript',
    'perl', 'php', 'python', 'ruby', 'rust', 'swift', 'typescript',
  ]
});

//merge() isn't required, but it enables autocomplete
module.exports = merge({
  entry: {
    main: path.join(__dirname, 'src', 'main.ts'),
    maincss: path.join(__dirname, 'src', 'main.css'),
  },
  output: {
    path: path.join(__dirname, 'docs'),
    filename: '[name].[contenthash].js',
    assetModuleFilename: 'assets/[hash][ext][query]',
  },
  resolve: {
    extensions: ['.ts', '.js']
  },

  plugins: [
    CleanupPluginConfig,
    HTMLWebpackPluginConfig,
    MiniCssExtractPluginConfig,
    MonacoWebpackPluginConfig,
  ],

  module: {
    rules: [{
      test: /\.ts$/,
      loader: 'ts-loader'
    }, {
      test: /\.css$/,
      use: [{
        loader: MiniCssExtractPlugin.loader,
        options: {
          publicPath: '',
        },
      }, {
        loader: 'css-loader',
        options: {
          url: true,
          import: true,
        },
      }],
    }, {
      test: /\.(mp3|svg|png|jpe?g|eot|ttf|woff|woff2)$/,
      type: 'asset/resource',
    }],
  },
});
