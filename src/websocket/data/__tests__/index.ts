import {marshal, marshal2FilePath} from "../marshal";
import {unmarshal, unmarshalByFilePath, unmarshalFieldInfo, unmarshalFieldInfoByFile} from "../unmarshal";

describe("数据转换", () => {

  const testData = {
    a: "abc",
    b: "efg",
    c: {
      a: 89,
      b: true
    }
  };

  const testStrArrData = ["hello", "world", "!!"];
  const expectMarshalStrData = `6
3
a
1
3
abcb
1
3
efgc
6
2
a
2
89
b
4
true
`;
  const expectMarshalStrArrData = `5
3
1
5
hello5
world2
!!`;


  test("数据序列化到字符串", () => {

    const testDataMarshalRes = marshal(testData);
    expect(expectMarshalStrData).toEqual(testDataMarshalRes);

    const testArrayData = [
      {id: 1, name: "test1", org: {name: "test1", code: "4566"}},
      {id: 2, name: "test2", org: {name: "test2", code: "4567"}},
      {id: 3, name: "test3", org: {name: "test3", code: "4568"}},
    ];
    const testArrDataMarshalRes = marshal(testArrayData);
    console.log(testArrDataMarshalRes)

    const testStrArrDataMarshalRes = marshal(testStrArrData);
    expect(testStrArrDataMarshalRes).toEqual(expectMarshalStrArrData);
  });
  test("数据序列化到文件", () => {
    const readyTestData = [
      testData,
      testStrArrData
    ];

    const readyTestRes = [
      expectMarshalStrData,
      expectMarshalStrArrData
    ];

    for (let i = 0; i < readyTestData.length; i++) {
      const path = marshal2FilePath(readyTestData[i]);
      const fs = require("fs");
      const content = fs.readFileSync(path);
      fs.unlinkSync(path);
      expect(content.toString("utf-8")).toEqual(readyTestRes[i]);
    }
  });
  test("数据反序列化内存", () => {
    const readyTestDataArr = [
      expectMarshalStrData,
      expectMarshalStrArrData
    ];

    const readyTestResDataArr = [
      testData,
      testStrArrData
    ];
    for (let i = 0; i < readyTestDataArr.length; i++) {
      const res: any = unmarshal<any>(readyTestDataArr[i]);
      const testRes = readyTestResDataArr[i];
      for (let ri in res) {
        expect(res[ri]).toEqual(testRes[ri]);
      }
    }
  });
  test("数据反序列化文件", () => {
    const fs = require("fs");
    const tmpFileName = "test.txt";
    const readyTestDataArr = [
      expectMarshalStrData,
      expectMarshalStrArrData
    ];

    const readyTestResDataArr = [
      testData,
      testStrArrData
    ];
    try {
      for (let i = 0; i < readyTestDataArr.length; i++) {
        fs.writeFileSync(tmpFileName, readyTestDataArr[i]);
        const res: any = unmarshalByFilePath(tmpFileName);
        const testRes = readyTestResDataArr[i];
        for (let ri in res) {
          expect(res[ri]).toEqual(testRes[ri]);
        }
      }
    } finally {
      fs.unlinkSync(tmpFileName);
    }

  });
  test("数据反序列化fieldInfoMapper", () => {
    const testArray = [
      expectMarshalStrArrData,
      expectMarshalStrData
    ];

    for (let str of testArray) {
      const fieldInfoMap = unmarshalFieldInfo(str);
    }
  });

  test("数据反序列化fieldInfoMapper文件", () => {
    const fs = require("fs");
    const {Buffer} = require("buffer");
    const tmpFileName = "test.txt";
    const testArray = [
      expectMarshalStrArrData,
      expectMarshalStrData
    ];

    for (let str of testArray) {
      fs.writeFileSync(tmpFileName, str);
      const fd = fs.openSync(tmpFileName, "r");
      try {
        const fieldInfoMap = unmarshalFieldInfoByFile(fs, fd, Buffer);
        console.log(fieldInfoMap);
      } finally {
        fs.closeSync(fd);
      }

    }
  });
});