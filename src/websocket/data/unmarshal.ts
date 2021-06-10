import {getFieldTypeByFieldTypeStr, getLineContent, getLineContentByFile, newLine} from "./utils";
import {FieldType, SocketDataError} from "./types";
import {FieldInfoMap, SocketFieldInfo} from "../socketFieldInfo";

type GetLineContentFn = () => string;
type GetLineContentByLenFn = (len: number) => string;
type GetLineNowPosFn = () => number;
type GetLineBreakLenFn = (breakLen: number) => void;
type GetLineCreateFieldInfo = (name: string, fieldType: FieldType, startPos: number, children?: FieldInfoMap) => SocketFieldInfo
type GetLineContentFns = {
  lineContent: GetLineContentFn
  lineLenContent: GetLineContentByLenFn
  nowIndex: GetLineNowPosFn
  breakLen: GetLineBreakLenFn
  createFieldInfo: GetLineCreateFieldInfo
}


export function unmarshal<T>(data: string): T {
  const tmpD = [data];
  const t = getLineContent(tmpD);
  const fieldType = getFieldTypeByFieldTypeStr(t);
  return unmarshalCore<T>(fieldType, {
    lineContent: () => {
      return getLineContent(tmpD);
    },
    lineLenContent: (len) => {
      const d = tmpD[0];
      const result = d.substring(0, len);
      tmpD[0] = d.substring(len);
      return result;
    }
  } as GetLineContentFns);
}

export function unmarshalByFilePath<T>(f: string): T {
  const requireFn: NodeRequire | undefined = require || window.require;
  if (!requireFn) {
    throw new SocketDataError("未在本地环境中运行");
  }

  const fs = requireFn("fs");
  const fd = fs.openSync(f, 'r');
  const {Buffer} = requireFn("buffer");
  try {
    const fieldType = getFieldTypeByFieldTypeStr(getLineContentByFile(fs, fd, Buffer));

    return unmarshalCore<T>(fieldType, {
      lineContent: () => {
        return getLineContentByFile(fs, fd, Buffer);
      },
      lineLenContent: len => {
        const buffer = Buffer.alloc(len);
        fs.readSync(fd, buffer, 0, len, null);
        return buffer.toString("utf-8");
      }
    } as GetLineContentFns);
  } finally {
    fs.close(fd);
  }
}


function unmarshalCore<T>(fieldType: FieldType, fns: GetLineContentFns): T {
  if (fieldType === FieldType.LIST) {
    let endData: any[] = [];
    const listLen = parseInt(fns.lineContent());
    const eleType = getFieldTypeByFieldTypeStr(fns.lineContent());

    for (let i = 0; i < listLen; i++) {
      if (eleType === FieldType.LIST || eleType === FieldType.STRUCT) {
        endData.push(unmarshalCore<any>(eleType, fns));
        continue;
      }
      if (eleType === FieldType.STRING) {
        const strLen = parseInt(fns.lineContent());
        endData.push(fns.lineLenContent(strLen));
        continue;
      }

      const lineContent = fns.lineContent();
      let settingData: any;
      if (eleType === FieldType.DOUBLE) {
        settingData = parseFloat(lineContent);
      } else if (eleType === FieldType.INTEGER) {
        settingData = parseInt(lineContent);
      } else if (eleType === FieldType.BOOL) {
        settingData = lineContent === "true";
      } else {
        throw new SocketDataError("错误的数据类型 => " + eleType);
      }

      endData.push(settingData);

    }

    return endData as any;
  }

  return unmarshalObjectCore<T>(fieldType, fns);
}

function unmarshalObjectCore<T>(fieldType, fns: GetLineContentFns): T {
  if (fieldType === FieldType.LIST) {
    return unmarshalCore(fieldType, fns);
  }

  if (fieldType !== FieldType.STRUCT) {
    throw new SocketDataError("不支持非Obj或Array的顶层结构");
  }

  const filedNum = parseInt(fns.lineContent());
  let endData: any = {};
  for (let i = 0; i < filedNum; i++) {
    const name = fns.lineContent();
    const eleType = getFieldTypeByFieldTypeStr(fns.lineContent());
    if (eleType === FieldType.LIST || eleType === FieldType.STRUCT) {
      endData[name] = unmarshalCore(eleType, fns);
      continue;
    }

    if (eleType === FieldType.STRING) {
      const strLen = parseInt(fns.lineContent());
      endData[name] = fns.lineLenContent(strLen);
      continue;
    }

    const lineContent = fns.lineContent();
    let settingData: any;
    if (eleType === FieldType.DOUBLE) {
      settingData = parseFloat(lineContent);
    } else if (eleType === FieldType.INTEGER) {
      settingData = parseInt(lineContent);
    } else if (eleType === FieldType.BOOL) {
      settingData = lineContent === "true";
    } else {
      throw new SocketDataError("错误的数据类型 => " + eleType);
    }
    endData[name] = settingData;
  }
  return endData;
}

export function dataIsError(data: string): boolean {
  return getFieldTypeByFieldTypeStr(data) === FieldType.ERROR;
}

export function dataIsVoid(data: string): boolean {
  return getFieldTypeByFieldTypeStr(data) === FieldType.VOID;
}

export function unmarshalErr(data: string): { code: string, msg: string } {
  if (!dataIsError(data[0])) {
    throw new SocketDataError("错误的字段类型");
  }
  const tmpD = [data];
  const code = getLineContent(tmpD);
  const msgLen = parseInt(getLineContent(tmpD));
  const msg = tmpD[0].substring(0, msgLen);
  return {code, msg};
}

export function unmarshalErrByFile(fs: any, fd: number, Buffer: any): { code: string, msg: string } {
  const header = Buffer.alloc(1);
  if (!dataIsError(header.toString("utf-8"))) {
    throw new SocketDataError("错误的字段类型");
  }

  const code = getLineContentByFile(fs, fd, Buffer);
  const msgLen = parseInt(getLineContentByFile(fs, fd, Buffer));
  const msgBuf = Buffer.alloc(msgLen);
  fs.readSync(fd, msgBuf, 0, msgLen, null);
  return {code, msg: msgBuf.toString("utf-8")};
}

export function unmarshalFieldInfoByFile(fs: any, fd: number, Buffer: any): FieldInfoMap {
  const fieldTypeStr = getLineContentByFile(fs, fd, Buffer);
  const index: number[] = [];
  index[0] = fieldTypeStr.length + 1;
  const fieldType = getFieldTypeByFieldTypeStr(fieldTypeStr);
  const result: FieldInfoMap = {};
  unmarshalFieldInfoCore(fieldType, result, {
    lineContent: () => {
      const content = getLineContentByFile(fs, fd, Buffer);
      index[0] += content.length + 1;
      return content;
    },
    lineLenContent: (len) => {
      index[0] += len;
      const buffer = Buffer.alloc(len);
      fs.readSync(fd, buffer, 0, len, null);
      return buffer.toString("utf-8");
    },
    breakLen: (breakLen) => {
      const readBlock = 1024 * 128;
      let readNum = 0;
      while (readNum < breakLen) {
        let bufLen = readBlock;
        const nextReadNum = readNum + readBlock;
        if (nextReadNum > breakLen) {
          bufLen = breakLen - readNum;
        }
        const buf = Buffer.alloc(bufLen);
        const len = fs.readSync(fd, buf, 0, bufLen, null);
        readNum += len;
      }
      index[0] += breakLen;
    },
    nowIndex: () => {
      return index[0];
    },
    createFieldInfo: (name, fieldType, startPos, children) => {
      return new SocketFieldInfo(name, fieldType, startPos, index[0], true, fd, children);
    }
  });
  return result;
}

export function unmarshalFieldInfo(data: string): FieldInfoMap {
  const tmpD = [data];
  const t = getLineContent(tmpD);
  const index: number[] = [];
  index[0] = t.length + 1;
  const fieldType = getFieldTypeByFieldTypeStr(t);
  const result: FieldInfoMap = {};
  unmarshalFieldInfoCore(fieldType, result, {
    lineContent: () => {
      const content = getLineContent(tmpD);
      index[0] += content.length + 1;
      return content;
    },
    lineLenContent: (len) => {
      const d = tmpD[0].substring(0, len);
      tmpD[0] = tmpD[0].substring(len);
      index[0] += len;
      return d;
    },
    breakLen: (breakLen) => {
      index[0] += breakLen;
      tmpD[0] = tmpD[0].substring(breakLen);
    },
    nowIndex: () => {
      return index[0];
    },
    createFieldInfo: (name, fieldType, startPos, children) => {
      return new SocketFieldInfo(name, fieldType, startPos, index[0], false, data, children);
    }
  });
  return result;
}

function unmarshalFieldInfoCore(fieldType: FieldType, fieldInfoMapList: FieldInfoMap, fns: GetLineContentFns) {
  if (fieldType === FieldType.LIST) {
    const listLen = parseInt(fns.lineContent());
    const eleType = getFieldTypeByFieldTypeStr(fns.lineContent());

    for (let i = 0; i < listLen; i++) {
      const startPos = fns.nowIndex();
      if (eleType === FieldType.LIST || eleType === FieldType.STRUCT) {
        const children = {};
        unmarshalFieldInfoCore(fieldType, children, fns);
        fieldInfoMapList[i + ""] = fns.createFieldInfo(i + "", eleType, startPos, children);
        continue;
      }

      if (eleType === FieldType.STRING) {
        const strLen = parseInt(fns.lineContent());
        fns.breakLen(strLen);
      } else {
        fns.lineContent();
      }
      fieldInfoMapList[i + ""] = fns.createFieldInfo(i + "", eleType, startPos);

    }
    return;
  }
  unmarshalObjFieldInfoCore(fieldType, fieldInfoMapList, fns);
}

function unmarshalObjFieldInfoCore(fieldType: FieldType, fieldInfoMap: FieldInfoMap, fns: GetLineContentFns) {
  if (fieldType === FieldType.LIST) {
    unmarshalFieldInfoCore(fieldType, fieldInfoMap, fns);
    return;
  }

  if (fieldType !== FieldType.STRUCT) {
    throw new SocketDataError("不支持非Obj或Array的顶层结构");
  }

  const fieldNum = parseInt(fns.lineContent());
  for (let i = 0; i < fieldNum; i++) {
    const startPos = fns.nowIndex();
    const name = fns.lineContent();
    const eleType = getFieldTypeByFieldTypeStr(fns.lineContent());
    if (eleType === FieldType.LIST || eleType === FieldType.STRUCT) {
      const children = {};
      unmarshalFieldInfoCore(fieldType, children, fns);
      fieldInfoMap[name] = fns.createFieldInfo(name, eleType, startPos, children);
      continue;
    }

    if (eleType === FieldType.STRING) {
      const strLen = parseInt(fns.lineContent());
      fns.breakLen(strLen);
    } else {
      fns.lineContent();
    }
    fieldInfoMap[name] = fns.createFieldInfo(name, eleType, startPos);
  }
}

// function unmarshalFieldInfoByMemData(data: string[], index: number[], fieldType: FieldType, fieldInfoMapList: FieldInfoMap) {
//   if (fieldType === FieldType.LIST) {
//     let listLenStr = getLineContent(data);
//     index[0] += listLenStr.length + 1;
//     const listLen = parseInt(listLenStr);
//
//     let eleTypeStr = getLineContent(data);
//     index[0] += eleTypeStr.length + 1;
//     const eleType = getFieldTypeByFieldTypeStr(eleTypeStr);
//
//     for (let i = 0; i < listLen; i++) {
//       const fieldMap = {
//         name: i + "",
//         startPos: index[0],
//         fieldType: eleType,
//       } as FieldInfo;
//       if (eleType === FieldType.LIST || eleType === FieldType.STRUCT) {
//         fieldMap.children = {};
//         unmarshalFieldInfoByMemData(data, index, fieldType, fieldMap.children);
//       }
//
//       if (eleType === FieldType.STRING) {
//         const strLenS = getLineContent(data);
//         const strLen = parseInt(strLenS);
//         index[0] += strLenS.length + 1 + strLen;
//         data[0] = data[0].substring(strLen);
//       } else {
//         index[0] += getLineContent(data).length + 1;
//       }
//
//       fieldInfoMapList[i + ""] = fieldMap;
//     }
//     return;
//   }
//
//   unmarshalObjFieldInfoByMemData(data, index, fieldType, fieldInfoMapList);
// }
//
// function unmarshalObjFieldInfoByMemData(data: string[], index: number[], fieldType: FieldType, fieldInfoMapList: FieldInfoMap) {
//   if (fieldType === FieldType.LIST) {
//     unmarshalFieldInfoByMemData(data, index, fieldType, fieldInfoMapList);
//     return;
//   }
//
//   if (fieldType !== FieldType.STRUCT) {
//     throw new SocketDataError("不支持非Obj或Array的顶层结构");
//   }
//
//   const fieldNumLen = getLineContent(data);
//   index[0] += fieldNumLen.length + 1;
//   const fieldNum = parseInt(fieldNumLen);
//   for (let i = 0; i < fieldNum; i++) {
//     const name = getLineContent(data);
//     index[0] += name.length + 1;
//     const fieldTypeStr = getLineContent(data);
//     index[0] += fieldTypeStr.length + 1;
//     const eleType = getFieldTypeByFieldTypeStr(fieldTypeStr);
//     const fieldMap = {
//       name,
//       startPos: index[0],
//       fieldType: eleType
//     } as FieldInfo;
//     if (eleType === FieldType.LIST || eleType === FieldType.STRUCT) {
//       fieldMap.children = {};
//       unmarshalFieldInfoByMemData(data, index, fieldType, fieldMap.children);
//     }
//
//     if (eleType === FieldType.STRING) {
//       const strLenS = getLineContent(data);
//       const strLen = parseInt(strLenS);
//       index[0] += strLenS.length + 1 + strLen;
//       data[0] = data[0].substring(strLen);
//     } else {
//       index[0] += getLineContent(data).length + 1;
//     }
//
//     fieldInfoMapList[name] = fieldMap;
//
//   }
// }
//
// export function unmarshal<T>(data: string): T {
//   const tmpD = [data];
//   const t = getLineContent(tmpD);
//   const fieldType = getFieldTypeByFieldTypeStr(t);
//   return unmarshalByMemData<T>(tmpD, fieldType);
// }
//
// export function unmarshalByFilePath<T>(f: string): T {
//   const requireFn: NodeRequire | undefined = require || window.require;
//   if (!requireFn) {
//     throw new SocketDataError("未在本地环境中运行");
//   }
//
//   const fs = requireFn("fs");
//   const fd = fs.openSync(f, 'r');
//   const {Buffer} = requireFn("buffer");
//   try {
//     const fieldType = getFieldTypeByFieldTypeStr(getLineContentByFile(fs, fd, Buffer));
//     return unmarshalByFile<T>(fs, fd, fieldType, Buffer);
//   } finally {
//     fs.close(fd);
//   }
//
// }
//
// function unmarshalByFile<T>(fs: any, fd: number, fieldType: FieldType, Buffer: any): T {
//   if (fieldType === FieldType.LIST) {
//     let endData: any[] = [];
//     const listLen = parseInt(getLineContentByFile(fs, fd, Buffer));
//     const eleType = getFieldTypeByFieldTypeStr(getLineContentByFile(fs, fd, Buffer));
//
//     for (let i = 0; i < listLen; i++) {
//       if (eleType === FieldType.LIST || eleType === FieldType.STRUCT) {
//         endData.push(unmarshalByFile<any>(fs, fd, eleType, Buffer));
//         continue;
//       }
//
//       if (eleType === FieldType.STRING) {
//         const strLen = parseInt(getLineContentByFile(fs, fd, Buffer));
//         const buffer = Buffer.alloc(strLen);
//         fs.readSync(fd, buffer, 0, strLen, null);
//         const str = buffer.toString('utf-8');
//         endData.push(str);
//         continue;
//       }
//
//       const lineContent = getLineContentByFile(fs, fd, Buffer);
//       let settingData: any;
//       if (eleType === FieldType.DOUBLE) {
//         settingData = parseFloat(lineContent);
//       } else if (eleType === FieldType.INTEGER) {
//         settingData = parseInt(lineContent);
//       } else if (eleType === FieldType.BOOL) {
//         settingData = lineContent === "true";
//       } else {
//         throw new SocketDataError("错误的数据类型 => " + eleType);
//       }
//       endData.push(settingData);
//     }
//     return endData as any;
//   }
//
//   return unmarshalObjByFile<T>(fs, fd, Buffer, fieldType);
// }
//
// function unmarshalObjByFile<T>(fs: any, fd: number, Buffer: any, fieldType: FieldType): T {
//   if (fieldType === FieldType.LIST) {
//     return unmarshalByFile(fs, fd, fieldType, Buffer);
//   }
//
//   if (fieldType !== FieldType.STRUCT) {
//     throw new SocketDataError("不支持非Obj或Array的顶层结构");
//   }
//
//   const filedNum = parseInt(getLineContentByFile(fs, fd, Buffer));
//   let endData: any = {};
//   for (let i = 0; i < filedNum; i++) {
//     const name = getLineContentByFile(fs, fd, Buffer);
//     const eleType = getFieldTypeByFieldTypeStr(getLineContentByFile(fs, fd, Buffer));
//     if (eleType === FieldType.LIST || eleType === FieldType.STRUCT) {
//       endData[name] = unmarshalByFile(fs, fd, fieldType, Buffer);
//       continue;
//     }
//
//     if (eleType === FieldType.STRING) {
//       const strLen = parseInt(getLineContentByFile(fs, fd, Buffer));
//       const buffer = Buffer.alloc(strLen);
//       fs.readSync(fd, buffer, 0, strLen, null);
//       endData[name] = buffer.toString('utf-8');
//       continue;
//     }
//
//     const lineContent = getLineContentByFile(fs, fd, Buffer);
//     let settingData: any;
//     if (eleType === FieldType.DOUBLE) {
//       settingData = parseFloat(lineContent);
//     } else if (eleType === FieldType.INTEGER) {
//       settingData = parseInt(lineContent);
//     } else if (eleType === FieldType.BOOL) {
//       settingData = lineContent === "true";
//     } else {
//       throw new SocketDataError("错误的数据类型 => " + eleType);
//     }
//     endData[name] = settingData;
//   }
//   return endData;
// }
//
// function unmarshalByMemData<T>(data: string[], fieldType: FieldType): T {
//   if (fieldType === FieldType.LIST) {
//     let endData: any[] = [];
//     const listLen = parseInt(getLineContent(data));
//     const eleType = getFieldTypeByFieldTypeStr(getLineContent(data));
//
//     for (let i = 0; i < listLen; i++) {
//       if (eleType === FieldType.LIST || eleType === FieldType.STRUCT) {
//         endData.push(unmarshalByMemData<any>(data, eleType));
//         continue;
//       }
//       if (eleType === FieldType.STRING) {
//         const strLen = parseInt(getLineContent(data));
//         const tmpD = data[0];
//         const str = tmpD.substring(0, strLen);
//         data[0] = tmpD.substring(strLen);
//         endData.push(str);
//         continue;
//       }
//
//       const lineContent = getLineContent(data);
//       let settingData: any;
//       if (eleType === FieldType.DOUBLE) {
//         settingData = parseFloat(lineContent);
//       } else if (eleType === FieldType.INTEGER) {
//         settingData = parseInt(lineContent);
//       } else if (eleType === FieldType.BOOL) {
//         settingData = lineContent === "true";
//       } else {
//         throw new SocketDataError("错误的数据类型 => " + eleType);
//       }
//
//       endData.push(settingData);
//
//     }
//
//     return endData as any;
//   }
//
//   return unmarshalObjByMemData<T>(fieldType, data);
// }
//
// function unmarshalObjByMemData<T>(fieldType: FieldType, data: string[]): T {
//   if (fieldType === FieldType.LIST) {
//     return unmarshalByMemData<T>(data, fieldType);
//   }
//
//   if (fieldType !== FieldType.STRUCT) {
//     throw new SocketDataError("不支持非Obj或Array的顶层结构");
//   }
//
//   const fieldNum = parseInt(getLineContent(data));
//   let endData: any = {};
//   for (let i = 0; i < fieldNum; i++) {
//     const name = getLineContent(data);
//     const eleType = getFieldTypeByFieldTypeStr(getLineContent(data));
//     if (eleType === FieldType.LIST || eleType === FieldType.STRUCT) {
//       endData[name] = unmarshalByMemData(data, eleType);
//       continue;
//     }
//
//     if (eleType === FieldType.STRING) {
//       const strLen = parseInt(getLineContent(data));
//       const tmpD = data[0];
//       endData[name] = tmpD.substring(0, strLen);
//       data[0] = tmpD.substring(strLen);
//       continue;
//     }
//
//     const content = getLineContent(data);
//     let settingContent: any;
//     if (eleType === FieldType.INTEGER) {
//       settingContent = parseInt(content);
//     } else if (eleType === FieldType.DOUBLE) {
//       settingContent = parseFloat(content);
//     } else if (eleType === FieldType.BOOL) {
//       settingContent = content === "true";
//     } else {
//       throw new SocketDataError("未知的数据类型 => " + eleType);
//     }
//     endData[name] = settingContent;
//   }
//
//   return endData;
// }
//
// function getFieldTypeByFieldTypeStr(str: string): FieldType {
//   const typeInt = parseInt(str);
//   if (typeInt < 1 || typeInt > 6) {
//     throw new SocketDataError("获取字段类型失败");
//   }
//   return typeInt;
// }
//

