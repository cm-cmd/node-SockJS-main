import {FieldType, SocketDataError} from "./data/types";
import {unmarshal} from "./data";

export interface FieldInfoMap {
  [key: string]: SocketFieldInfo
}

export class SocketFieldInfo {
  get err(): Error | undefined {
    return this._err;
  }

  get name(): string {
    return this._name;
  }

  get length(): number {
    return this._length;
  }

  get children(): FieldInfoMap | undefined {
    return this._children;
  }

  /**
   * 名称.
   * @private
   */
  private readonly _name: string;

  /**
   * 长度.
   * @private
   */
  private readonly _length: number;

  /**
   * 字段类型
   * @private
   */
  private readonly _fieldType: FieldType;

  /**
   * 开始位置
   * @private
   */
  private readonly _startPos: number;

  /**
   * 结束位置.
   * @private
   */
  private readonly _endPos: number;

  /**
   *
   * @private
   */
  private readonly _children: FieldInfoMap | undefined;

  /**
   * fd.
   * @private
   */
  private readonly _fd: number | undefined;

  /**
   * 数据.
   * @private
   */
  private readonly _data: string | undefined;

  /**
   * 是否是文件.
   * @private
   */
  private readonly _isFile: boolean;

  /**
   * 索引.
   * @private
   */
  private _index: number = 0;

  /**
   * 错误
   * @private
   */
  private _err: Error | undefined;

  /**
   * 文件系统
   * @private
   */
  private _fs: any;

  /**
   * buffer.
   * @private
   */
  private _Buffer: any;

  constructor(name: string, fieldType: FieldType, startPos: number, endPos: number, isFile: boolean, fd: number | string, children?: FieldInfoMap) {
    this._name = name;
    this._fieldType = fieldType;
    this._startPos = startPos;
    this._endPos = endPos;
    this._children = children;
    this._isFile = isFile;
    this._length = endPos - startPos;
    try {
      if (this._isFile) {
        this._fd = fd as any;
        const requireFn = require || window.require;
        this._fs = requireFn("fs");
        const {Buffer} = requireFn("buffer");
        this._Buffer = Buffer;
      } else {
        this._data = fd as any;
      }
    } catch (e) {
      this._err = new SocketDataError("转换字段流失败 => " + e.message);
    }
  }

  /**
   *三种读取字段方式：1.从头开始 2.从指定位置 3.读取所有
   * @param len
   */
  public read(len: number): string {
    if (this._err) {
      return "";
    }

    const startPos = this._index;
    this._index += len;
    if (this._index > this._length) {
      this._index += this._length - this._index;
    }
    return this._read(startPos, this._index);
  }

  public readByPos(start: number, end: number): string {
    if (this._err) {
      return "";
    }

    return this._read(start, end);
  }

  public readAll(): string {
    if (this._err) {
      return "";
    }
    return this._read(0, this._length);
  }

  public read2Object<T>(): T | undefined {
    if (this._err) {
      return undefined;
    }
    return unmarshal<T>(this.readAll());
  }

  private _read(startPos: number, endPos: number): string {
    if (this._err) {
      return "";
    }

    if (endPos > this._length) {
      endPos = this._length;
    }

    const readLen = endPos - startPos;
    if (readLen <= 0) {
      return "";
    }

    try {
      if (this._isFile) {
        const buf = Buffer.alloc(readLen);
        this._fs.readSync(this._fd, buf, 0, readLen, this._startPos);
        return buf.toString('utf-8');
      } else {
        return this._data!.substring(startPos, endPos);
      }
    } catch (e) {
      this._err = new SocketDataError("获取流中内容失败");
      return "";
    }
  }

}