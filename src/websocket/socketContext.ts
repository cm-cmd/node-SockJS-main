import {
  dataIsError,
  dataIsVoid,
  marshal,
  marshal2FilePath,
  marshalVoid,
  marshalVoid2FilePath,
  unmarshal,
  unmarshalByFilePath,
  unmarshalErr,
  unmarshalErrByFile,
  unmarshalFieldInfo,
  unmarshalFieldInfoByFile
} from "./data";
import {FieldInfoMap, SocketFieldInfo} from "./socketFieldInfo";
import {WebsocketClient} from "./websocketClient";
import {MsgMod} from "./types";
import {v4} from "uuid";

/**
 * 接口是对行为的抽象.
 * ?:表示cmd是一个可选属性.
 */
interface SendMsgInfo {
  cmd?: string;
  msgId: string;
  mod: MsgMod;
  data: string;
}

export class SocketContextError extends Error {
  private readonly _srcErr: Error | undefined;
  private readonly _code: string;

  public get srcErr() {
    return this._srcErr;
  }

  public get code() {
    return this._code;
  }

  constructor(code: string, msg: string, err: Error | undefined) {
    super(msg);
    this.name = "socketContextError";
    this._srcErr = err;
    this._code = code;
  }
}

export class SocketContext {

  get sendInfo(): SendMsgInfo | undefined {
    this._isReturn = true;
    const sendInfo = this._sendInfo;
    this._sendInfo = undefined;
    return sendInfo;
  }

  get isVoid(): boolean {
    return this._isVoid;
  }

  get err(): Error | undefined {
    return this._err;
  }

  get fields(): string[] {
    return this._fields;
  }

  get data(): string {
    return this._data;
  }

  get cmd(): string {
    return this._cmd;
  }

  get msgId(): string {
    return this._msgId;
  }

  get mod(): string {
    return this._mod;
  }

  get dataLen(): number {
    return this._dataLen;
  }

  private static requireFn = require || window.require;

  /**
   * 字段分隔符.
   * @private
   */
  private static _fieldSplitChar = ';';

  /**
   * 命令码.
   * @private
   */
  private _cmd: string;

  /**
   * 消息ID.
   * @private
   */
  private _msgId: string;

  /**
   * 模式.
   * @private
   */
  private _mod: MsgMod;

  /**
   * 数据长度.
   * @private
   */
  private readonly _dataLen: number;

  /**
   * 数据.
   * @private
   */
  private _data: string;

  /**
   * 字段名字.
   * @private
   */
  private _fields: string[] = [];

  /**
   * 字段位置.
   * @private
   */
  private _fieldsInfoMap: FieldInfoMap = {};

  /**
   * 文件描述符
   * @private
   */
  private _fd: number | undefined;

  /**
   * 错误.
   * @private
   */
  private _err: Error | undefined;

  /**
   * 是否被销毁
   * @private
   */
  private _isDestroy = false;

  /**
   * 是否为void类型.
   * @private
   */
  private _isVoid: boolean = false;

  /**
   * 是否已经返回.
   * @private
   */
  private _isReturn: boolean = false;

  /**
   * 返回信息.
   * @private
   */
  private _sendInfo: SendMsgInfo | undefined;

  /**
   * 子级上下文.
   * @private
   */
  private _childrenContext: SocketContext | undefined;

  public constructor(cmd: string, msgId: string, mod: MsgMod, dataLen: number, data: string) {
    this._cmd = cmd;
    this._msgId = msgId;
    this._mod = mod;
    this._dataLen = dataLen;
    this._data = data;
    if (dataLen <= 0) {
      return;
    }
    this.parseFields();
  }

  public static createSendMsgContext(cmd: string, mod?: MsgMod, obj?: Object): SocketContext {
    // let mod: MsgMod = MsgMod.File;
    mod = mod || SocketContext.requireFn ? MsgMod.Mem : MsgMod.File;
    let data: string;
    const msgId = `${v4()}${new Date().getTime()}`;
    const context = new SocketContext(cmd, msgId, mod, 0, "");
    try {
      if (mod === MsgMod.Mem) {
        if (obj) {
          data = marshal(obj);
        } else {
          data = marshalVoid();
        }
      } else {
        if (obj) {
          data = marshal2FilePath(obj);
        } else {
          data = marshalVoid2FilePath();
        }
      }
    } catch (e) {
      context._err = new SocketContextError("-4", "参数转换异常", e);
      return context;
    }


    context._sendInfo = {
      cmd,
      msgId,
      mod,
      data
    };
    return context;
  }

  private parseFields() {
    if (this._mod === "0") {
      this.parseFileFields();
    } else {
      this.parseMemFields();
    }
  }

  private parseFileFields() {
    try {
      const fs = SocketContext.requireFn("fs");
      const Buffer = SocketContext.requireFn("buffer");
      this._fd = fs.openSync(this.data, 'r');
      const buffer = Buffer.alloc(1);
      const dataHeader = fs.readSync(this._fd, buffer, 0, 1, 0);
      if (dataIsVoid(dataHeader)) {
        this._isVoid = true;
        return;
      }

      if (dataIsError(dataHeader)) {
        const errData = unmarshalErrByFile(fs, this._fd!, Buffer);
        this._err = new SocketContextError(errData.code, errData.msg, undefined);
        return;
      }

      this._fieldsInfoMap = unmarshalFieldInfoByFile(fs, this._fd!, Buffer);

    } catch (e) {
      this._err = new SocketContextError("-1", "操作文件失败", e);
    }

  }

  private parseMemFields() {
    const header = this._data[0];
    if (dataIsVoid(header)) {
      this._isVoid = true;
      return;
    }

    if (dataIsError(header)) {
      const errData = unmarshalErr(this._data);
      this._err = new SocketContextError(errData.code, errData.msg, undefined);
      return;
    }
    this._fieldsInfoMap = unmarshalFieldInfo(this._data);
  }

  /**
   * <T>泛型T，在使用时才确定类型.
   */
  public unmarshal<T>(): T {
    if (this.mod === "0") {
      return unmarshalByFilePath(this.data);
    }
    return unmarshal<T>(this.data);
  }

  public settingChildrenContext(context: SocketContext) {
    if (this._childrenContext) {
      this._childrenContext.destroy().then(r => {
      }).catch(() => {
      });
    }

    this._childrenContext = context;

  }

  public param(key: string): SocketFieldInfo | undefined {
    return this._fieldsInfoMap[key];
  }

  public async returnObj(obj: any): Promise<SocketContext> {
    this._isReturn = true;
    let data: string;
    if (this._mod === MsgMod.Mem) {
      data = marshal(obj);
    } else {
      data = marshal2FilePath(obj);
    }
    this._sendInfo = {
      msgId: this.msgId,
      mod: this._mod,
      data
    };
    return await WebsocketClient.getConn().sendMsg(this);
  }

  public async destroy() {
    if (this._isDestroy) {
      return;
    }
    WebsocketClient.rmWaitMsg(this._msgId);
    try {
      await WebsocketClient.getConn().sendMsg(this);
    } catch (e) {
    } finally {

    }
    this._cmd = "";
    this._fields = [];
    this._err = undefined;
    this._fieldsInfoMap = {};
    this._msgId = "";
    if (this._mod === "0") {
      try {
        const fs = SocketContext.requireFn("fs");
        fs.unlinkSync(this._data);
      } catch (e) {

      }
    }

    this._mod = "" as any;
    this._data = "";

    if (this._childrenContext) {
      await this._childrenContext.destroy();
    }
    this._childrenContext = undefined;
  }
}