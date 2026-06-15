const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

class InlineChunkPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('InlineChunkPlugin', (compilation) => {
      HtmlWebpackPlugin.getHooks(compilation).alterAssetTagGroups.tapAsync(
        'InlineChunkPlugin',
        (data, callback) => {
          const inline = (tags) =>
            tags.map((tag) => {
              if (tag.tagName === 'script' && tag.attributes && tag.attributes.src) {
                const src = String(tag.attributes.src).replace(/^(\.\/|\/)*/, '');
                const asset = compilation.assets[src];
                if (asset) {
                  return {
                    tagName: 'script',
                    innerHTML: asset.source(),
                    closeTag: true,
                    attributes: {},
                  };
                }
              }
              return tag;
            });
          data.headTags = inline(data.headTags);
          data.bodyTags = inline(data.bodyTags);
          callback(null, data);
        }
      );
    });
  }
}

function makeConfig(entry, outputFile, templateFile, isDefault = false) {
  return {
    entry,
    devServer: isDefault ? {
      port: 9000,
      historyApiFallback: { index: `/${outputFile}` },
      headers: { 'Access-Control-Allow-Origin': '*' },
    } : undefined,
    output: {
      filename: outputFile.replace('.html', '.js'),
      path: path.resolve(__dirname, 'dist'),
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: templateFile,
        filename: outputFile,
        inject: 'body',
      }),
      new InlineChunkPlugin(),
    ],
    optimization: {
      splitChunks: false,
      runtimeChunk: false,
    },
  };
}

module.exports = [
  makeConfig('./src-catalog/index.tsx',             'catalog.html',             './src-catalog/index.html'),
  makeConfig('./src-skill-request-form/index.tsx',  'skill-request-form.html',  './src-skill-request-form/index.html', true),
  makeConfig('./src-optimize-skills/index.tsx',     'optimize-skills.html',     './src-optimize-skills/index.html'),
  makeConfig('./src-skill-view/index.tsx',          'skill-view.html',          './src-skill-view/index.html'),
  makeConfig('./src-skill-request-view/index.tsx',  'skill-request-view.html',  './src-skill-request-view/index.html'),
];
