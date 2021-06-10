import {SocketContext} from "./socketContext";

export type SocketEventHandle = (socketContext: SocketContext) => void

export enum MsgMod {
  File = "0",
  Mem = "1"
}

