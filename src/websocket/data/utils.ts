import {FieldType, SocketDataError} from "./types";

export const newLine = '\n';

export function ObjectKeys(data: Object): string[] {
  let names: string[] = [];
  for (let d in data) {
    names.push(d);
  }
  return names;
}

export function getFieldType(data: any): FieldType {
  if (data instanceof Array) {
    return FieldType.LIST;
  }

  switch (typeof data) {
    case "boolean":
      return FieldType.BOOL;
    case "string":
      return FieldType.STRING;
    case "object":
      return FieldType.STRUCT;
    case "number":
      const numData = data + "";
      if (numData.includes(".")) {
        return FieldType.DOUBLE;
      }
      return FieldType.INTEGER;
    default:
      throw new SocketDataError("获取数据类型失败");
  }
}

export function joinLineStr(str: any): string {
  return str + newLine;
}

export function getListEleFieldType(data: Array<any>): FieldType | undefined {
  if (data.length == 0) {
    return undefined;
  }

  const firstEleFieldType = getFieldType(data[0]);
  for (let i = 1; i < data.length; i++) {
    if (getFieldType(data[i]) !== firstEleFieldType) {
      throw new SocketDataError("数组内元素必须保持一致");
    }
  }
  return firstEleFieldType;
}

export function getLineContent(data: string[]): string {
  const tmpD = data[0];
  const index = tmpD.indexOf(newLine);
  if (index < 0) {
    return "";
  }

  const content = tmpD.substring(0, index);
  data[0] = tmpD.substring(index + 1);
  return content;
}

export function getFieldTypeByFieldTypeStr(str: string): FieldType {
  const typeInt = parseInt(str);
  if (typeInt < 1 || typeInt > 6) {
    throw new SocketDataError("获取字段类型失败");
  }
  return typeInt;
}

export function getLineContentByFile(fs: any, fd: number, Buffer: any): string {
  const buffer = Buffer.alloc(1);
  let lineStr = "";
  while (true) {
    const num = fs.readSync(fd, buffer, 0, 1, null);
    if (num == 0) {
      // throw new SocketDataError("读取文件内容失败");
      return ""
    }
    const bufStr = buffer.toString("utf-8");
    if (bufStr === newLine) {
      return lineStr;
    }
    lineStr += bufStr;
  }
}