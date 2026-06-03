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

function makeConfig(entry, outputFile, templateFile) {
  return {
    entry,
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
  makeConfig('./src-catalog/index.tsx',            'catalog.html',            './src-catalog/index.html'),
  makeConfig('./src-skill-request-form/index.tsx',  'skill-request-form.html', './src-skill-request-form/index.html'),
];
