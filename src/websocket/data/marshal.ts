import {FieldType, SocketDataError} from "./types";
import {getFieldType, getListEleFieldType, joinLineStr, ObjectKeys} from "./utils";
import {v4} from "uuid";

function createTmpFile(): { fs: any, fd: any, filePath: string } {
  const requireFn: NodeRequire | undefined = require || window.require;
  if (!requireFn) {
    throw new SocketDataError("未在本地环境中运行");
  }
  const fs = requireFn("fs");
  const os = requireFn("os");
  const filepath = require("path");
  const tmpDir = filepath.join(os.tmpdir(), "devPlatform_w");

  fs.mkdirSync(tmpDir, {
    recursive: true
  });

  const tmpFilePath = filepath.join(tmpDir, `${v4()}${new Date().getTime()}`);
  const dataFile = fs.openSync(tmpFilePath, 'w');
  return {fs, fd: dataFile, filePath: tmpFilePath};
}

export function marshalVoid2FilePath(): string {
  const {fs, fd, filePath} = createTmpFile();
  try {
    fs.writeSync(fd, FieldType.VOID + "\n");
  } catch (e) {
    fs.unlinkSync(filePath);
    throw e;
  } finally {
    fs.closeSync(fd);
  }
  return filePath;
}


/**
 * 序列化到文件.
 * @param data 数据
 */
export function marshal2FilePath(data: any): string {

  const {fs, fd, filePath} = createTmpFile();

  try {
    marshal2File(fs, fd, data);
  } catch (e) {
    fs.unlinkSync(filePath);
    throw e;
  } finally {
    fs.closeSync(fd);
  }

  return filePath;
}

function marshal2File(fs: any, fd: number, data: any) {
  if (data instanceof Array) {
    fs.writeSync(fd, joinLineStr(FieldType.LIST));
    fs.writeSync(fd, joinLineStr(data.length));
    if (data.length === 0) {
      return;
    }
    const eleFieldType = getListEleFieldType(data);
    if (!eleFieldType) {
      throw new SocketDataError("获取数组内元素类型失败");
    }

    fs.writeSync(fd, joinLineStr(eleFieldType));
    if (eleFieldType === FieldType.STRUCT || eleFieldType === FieldType.LIST) {
      for (let d of data) {
        marshalObj2File(fs, fd, d, false);
      }
    } else {
      for (let d of data) {
        if (eleFieldType === FieldType.STRING) {
          fs.writeSync(fd, joinLineStr(d.length) + d);
          continue;
        }
        fs.writeSync(fd, joinLineStr(d));
      }
    }
    return;
  }

  marshalObj2File(fs, fd, data, true);
}

function marshalObj2File(fs: any, fd: number, data: any, writeType: boolean) {
  if (data instanceof Array) {
    return marshal2File(fs, fd, data);
  }

  if (typeof data !== "object") {
    throw new SocketDataError("不支持非Obj或Array的顶层结构");
  }

  const keyLen = ObjectKeys(data).length;
  if (writeType) {
    fs.writeSync(fd, joinLineStr(FieldType.STRUCT));
  }
  fs.writeSync(fd, joinLineStr(keyLen));
  for (let n in data) {
    const v = data[n];
    fs.writeSync(fd, joinLineStr(n));
    const fieldType = getFieldType(v);
    if (fieldType === FieldType.LIST || fieldType === FieldType.STRUCT) {
      marshal2File(fs, fd, v);
      continue;
    }
    fs.writeSync(fd, joinLineStr(fieldType));
    if (fieldType === FieldType.STRING) {
      fs.writeSync(fd, joinLineStr(v.length));
      fs.writeSync(fd, v + "");
      continue;
    }
    fs.writeSync(fd, joinLineStr(v));
  }
}

export function marshalVoid(): string {
  return FieldType.VOID + "\n";
}

/**
 * 序列化.
 * @param data 数据
 */
export function marshal(data: any): string {
  if (data instanceof Array) {
    let endStr = joinLineStr(FieldType.LIST) + joinLineStr(data.length);
    if (data.length === 0) {
      return endStr;
    }
    const eleFieldType = getListEleFieldType(data);
    if (!eleFieldType) {
      throw new SocketDataError("获取数组内元素类型失败");
    }
    endStr += joinLineStr(eleFieldType);
    if (eleFieldType === FieldType.STRUCT || eleFieldType === FieldType.LIST) {
      for (let d of data) {
        endStr += marshalObj(d, false);
      }
    } else {
      for (let d of data) {
        if (eleFieldType === FieldType.STRING) {
          endStr += joinLineStr(d.length) + d;
          continue;
        }
        endStr += joinLineStr(d);
      }
    }

    return endStr;
  }

  return marshalObj(data, true);
}

/**
 * 序列化对象.
 * @param data 数据
 * @param writeType 是否写出类别
 */
function marshalObj(data: any, writeType: boolean): string {
  if (data instanceof Array) {
    return marshal(data);
  }

  if (typeof data !== "object") {
    throw new SocketDataError("不支持非Obj或Array的顶层结构");
  }

  const keyLen = ObjectKeys(data).length;
  let endStr = "";
  if (writeType) {
    endStr = joinLineStr(FieldType.STRUCT);
  }
  endStr += joinLineStr(keyLen);
  for (let n in data) {
    const v = data[n];
    endStr += joinLineStr(n);
    const fieldType = getFieldType(v);
    if (fieldType === FieldType.LIST || fieldType === FieldType.STRUCT) {
      endStr += marshal(v);
      continue;
    }
    endStr += joinLineStr(fieldType);
    if (fieldType === FieldType.STRING) {
      endStr += joinLineStr(v.length) + v;
      continue;
    }

    endStr += joinLineStr(v);
  }

  return endStr;
}
