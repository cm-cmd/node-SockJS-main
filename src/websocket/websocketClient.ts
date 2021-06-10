// import WebSocket from "ws";
import SockJS from "sockjs-client"
import {MsgMod, SocketEventHandle} from "./types";
import {SocketContext, SocketContextError} from "./socketContext";

const msgBlockSize = 1024 * 1024;

interface SocketEventHandleMap {
    [key: string]: SocketEventHandle
}

export type WebSocketClientHookFn = (websocketClient: WebsocketClient) => void


interface SocketMsgWaitMap {
    [key: string]: { context: SocketContext, resolve: any, reject: any }
}

/**
 * 客户端.
 */
export class WebsocketClient {

    private static hookFn: { "open": WebSocketClientHookFn, "close": WebSocketClientHookFn } = {} as any;

    /**
     * 实例.
     * @private
     */
    private static instance: WebsocketClient | undefined;

    /**
     * socket处理Mapper.
     * @private
     */
    private static socketEventHandleMap: SocketEventHandleMap = {};

    /**
     * socket消息等待map.
     * @private
     */
    private static socketMsgWaitMap: SocketMsgWaitMap = {};

    /**
     * url地址.
     * @private
     */
    readonly url: string;

    /**
     * 是否关闭.
     * @private
     */
    private isOpen: boolean = false;

    /**
     * Websocket连接.
     * @private
     */
    private conn: any;

    /**
     * 消息处理器.
     * @private
     */
    private msgHandler: SocketMsgHandler = new SocketMsgHandler();

    /**
     * 最后一次Error.
     */
    public lastErr: Error | undefined;

    /**
     * 构造函数.
     * @param url 连接地址
     * @private
     */
    private constructor(url: string,) {
        this.url = url;
        this.init();
    }

    /**
     * 初始化.
     * @private
     */
    private init() {
        this.conn = new SockJS(this.url);
        this.conn.onopen = () => {
            this.isOpen = true;
            this.lastErr = undefined;
            if (WebsocketClient.hookFn["open"]) {
                WebsocketClient.hookFn["open"](this);
            }
        };

        this.conn.onerror = (err) => {
            this.lastErr = err;
        };

        this.conn.onclose = () => {
            this.isOpen = false;
            if (WebsocketClient.hookFn["close"]) {
                WebsocketClient.hookFn["close"](this);
            }
        };

        this.conn.onmessage = (data: string) => {
            const socketContextList = this.msgHandler.handle(data);
            if (!socketContextList || socketContextList.length <= 0) {
                return;
            }
            for (let socketContext of socketContextList) {
                if (!socketContext.cmd) {
                    const waitInfo = WebsocketClient.socketMsgWaitMap[socketContext.msgId];
                    if (waitInfo) {
                        waitInfo.context.settingChildrenContext(socketContext);
                        waitInfo.resolve(socketContext);
                    }
                    delete WebsocketClient.socketMsgWaitMap[socketContext.msgId];
                    continue;
                }
                try {
                    const eventFn = WebsocketClient.socketEventHandleMap[socketContext.cmd];
                    if (!eventFn) {
                        socketContext.destroy();
                        continue;
                    }
                    eventFn(socketContext);
                } catch (e) {
                } finally {
                    socketContext.destroy();
                }

            }
        };
    };

    public reconnection() {
        if (this.conn) {
            this.conn.close();
        }

        this.init();
    }

    private _sendMsg(str: string) {
        this.conn.send(str);
    }

    public sendMsg(socketContext: SocketContext): Promise<SocketContext> {
        const sendInfo = socketContext.sendInfo!;
        return new Promise<SocketContext>(async (resolve, reject) => {
            if (!this.isOpen) {
                reject(new SocketContextError("-2", "未与服务器建立连接", undefined));
                return;
            }
            WebsocketClient.socketMsgWaitMap[sendInfo.msgId] = {context: socketContext, resolve, reject};
            const msgHeader = `${sendInfo.cmd || ""}\n${sendInfo.msgId}\n${sendInfo.mod}\n`;
            try {
                this._sendMsg(msgHeader);
                if (sendInfo.mod === MsgMod.File) {
                    this._sendMsg(`${sendInfo.data}\n`);
                } else {
                    const dataLen = sendInfo.data.length;
                    this._sendMsg(`${dataLen}\n`);
                    if (dataLen <= msgBlockSize) {
                        this._sendMsg(`${sendInfo.data}`);
                    } else {
                        const blockSize = Math.ceil(dataLen / msgBlockSize);
                        for (let i = 0; i < blockSize; i++) {
                            const startPos = i * msgBlockSize;
                            const endPos = (i + 1) * msgBlockSize;
                            this._sendMsg(sendInfo.data.substring(startPos, endPos));
                        }
                    }
                    if (!sendInfo.data.endsWith("\n")) {
                        this._sendMsg("\n");
                    }
                }
            } catch (e) {
                try {
                    if (sendInfo.mod === MsgMod.File) {
                        const requireFn = require || window.require;
                        const fs = requireFn("fs");
                        fs.unlinkSync(sendInfo.data);
                    }
                } catch (e) {
                }

                reject(e);
            }
        });
    }

    /**
     * 注册事件处理器.
     * @param cmdStr 命令码
     * @param eventFn 处理函数
     */
    public static registryEventHandle(cmdStr: string, eventFn: SocketEventHandle) {
        WebsocketClient.socketEventHandleMap[cmdStr] = eventFn;
    }

    public static registryWebsocketHook(hookName: "open" | "close", callBack: WebSocketClientHookFn) {
        WebsocketClient.hookFn[hookName] = callBack;
    }

    public static rmWaitMsg(msgId: string) {
        delete WebsocketClient.socketMsgWaitMap[msgId];
    }

    public static clearWaitMsgMap() {
        WebsocketClient.socketMsgWaitMap = {};
    }

    public static init(url: string = "http://192.168.100.31:8030/ws") {
        if (!WebsocketClient.instance) {
            WebsocketClient.instance = new WebsocketClient(url);
            return;
        }
        if (WebsocketClient.instance.lastErr) {
            WebsocketClient.instance.reconnection();
        }
    }

    public static getConn(): WebsocketClient {
        if (!WebsocketClient.instance) {
            WebsocketClient.init();
            return WebsocketClient.instance!;
        }
        if (WebsocketClient.instance.lastErr) {
            WebsocketClient.instance.reconnection();
        }
        return WebsocketClient.instance;
    }

}

export class SocketMsgHandler {

    private readonly newLine = "\n";

    /**
     * 临时消息.
     * @private
     */
    private tmpMsg: string = "";

    /**
     * 命令.
     * @private
     */
    private cmd: string | undefined;

    /**
     * 模式.
     * 0---文件
     * 其他---内存
     * @private
     */
    private mod: MsgMod | undefined;

    /**
     * 消息ID.
     * @private
     */
    private msgId: string | undefined;

    /**
     * 数据长度.
     * @private
     */
    private dataLen: number | undefined;

    /**
     * 是否为第一次.
     * @private
     */
    private isFirst: boolean = true;


    /**
     * 消息处理返回上下文.
     * @param data
     */
    public handle(data: string): SocketContext[] {
        const socketContextList: SocketContext[] = [];
        data = this.tmpMsg + data;
        this.tmpMsg = "";
        while (true) {
            const socketContext = this.handleMsg(data);
            if (!socketContext) {
                break;
            }
            socketContextList.push(socketContext);
            data = this.tmpMsg;
        }
        return socketContextList;
    }

    /**
     * 处理消息转换为上下文
     * @param data 待处理消息
     * @private
     */
    private handleMsg(data: string): SocketContext | undefined {

        if (data.length === 0) {
            return;
        }

        // 字符串为值传递, 函数内部修改上层无法感知, 转换为arr, 好做感知判断^_^
        const tmpD = [data];

        if (!this.cmd && this.isFirst && data[0] !== this.newLine) {
            const resData = this.readLineContent(tmpD);
            if (!resData.canNext) {
                return;
            }
            this.cmd = resData.content;
        } else if (!this.cmd && this.isFirst && data[0] === this.newLine) {
            this.readLineContent(tmpD);
        }

        this.isFirst = false;
        if (!this.msgId) {
            const resData = this.readLineContent(tmpD);
            if (!resData.canNext) {
                return;
            }
            this.msgId = resData.content;
        }

        if (typeof this.mod === "undefined") {
            const resData = this.readLineContent(tmpD);
            if (!resData.canNext) {
                return;
            }
            this.mod = resData.content as any;
        }

        if (this.mod === "0") {
            const resData = this.readLineContent(tmpD);
            if (!resData.canNext) {
                return;
            }
            const result = new SocketContext(this.cmd!, this.msgId!, this.mod, resData.content!.length, resData.content!);
            this.clearDataFlag();
            return result;
        }

        if (typeof this.dataLen === "undefined") {
            const resData = this.readLineContent(tmpD);
            if (!resData.canNext) {
                return;
            }
            this.dataLen = parseInt(resData.content!);
        }

        if (this.dataLen > tmpD[0].length) {
            this.tmpMsg = tmpD[0];
            return;
        }

        const content = tmpD[0].substring(0, this.dataLen);
        this.tmpMsg = tmpD[0].substring(this.dataLen);

        const result = new SocketContext(this.cmd!, this.msgId!, this.mod!, this.dataLen, content);
        this.clearDataFlag();
        return result;
    }

    private clearDataFlag() {
        this.cmd = undefined;
        this.msgId = undefined;
        this.mod = undefined;
        this.dataLen = undefined;
        this.isFirst = true;
        this.tmpMsg = "";
    }

    private readLineContent(data: string[]): { content: string | undefined, canNext: boolean } {
        const tmpD = data[0];
        if (tmpD.length === 0) {
            return {content: undefined, canNext: false};
        }

        const contentIndex = tmpD.indexOf(this.newLine);
        if (contentIndex < 0) {
            this.tmpMsg += data;
            return {content: undefined, canNext: false};
        }

        const content = tmpD.substring(0, contentIndex);
        data[0] = tmpD.substring(contentIndex + 1);

        return {content, canNext: true};

    }

}