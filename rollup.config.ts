import commonjs from "rollup-plugin-commonjs"

import uglify from 'rollup-plugin-uglify';
import pkg from './package.json';


export default [
    {
        input: "./dist/lib/index.js",
        output: {
            file: `./dist/index-amd-${pkg.version}.min.js`,
            format: "amd"
        },
        plugins: [
            commonjs(),
            uglify.uglify()
        ]
    },
    {
        input: "./dist/lib/index.js",
        output: {
            file: `./dist/index-cjs-${pkg.version}.min.js`,
            format: "cjs"
        },
        plugins: [
            commonjs(),
            uglify.uglify()
        ]
    },
    {
        input: "./dist/lib/index.js",
        output: {
            file: `./dist/index-iife${pkg.version}.min.js`,
            name: "bk_dateFormat",
            format: "iife"
        },
        plugins: [
            commonjs(),
            uglify.uglify()
        ]
    },
    {
        input: "./dist/lib/index.js",
        output: {
            file: `./dist/index-umd-${pkg.version}.min.js`,
            name: "bk_dateFormat",
            format: "umd"
        },
        plugins: [
            commonjs(),
            uglify.uglify()
        ]
    }
]
// ,
// // {
// //     file: `./dist/index-es-${pkg.version}.min.js`,
// //     format: "es"
// // },
// {
//     file: `./dist/index-umd-${pkg.version}.min.js`,
//         name: "bk_dateFormat",
//     format: "umd"
// }