export enum FieldType {
  STRING = 1,
  INTEGER,
  DOUBLE,
  BOOL,
  LIST,
  STRUCT,
  VOID,
  ERROR
}

export class SocketDataError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "数据序列化错误";
  }
}