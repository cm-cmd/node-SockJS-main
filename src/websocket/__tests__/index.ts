import {WebsocketClient} from "../websocketClient";
import {SocketContext} from "../socketContext";
import {MsgMod} from "../types";

describe("测试一些常用函数", () => {
  test("测试字符串截取", () => {
    const str: string = "abc\n";
    const lineIndex = str.indexOf('\n');
    const content = str.substring(0, lineIndex);
    expect(content).toEqual("abc");

    const otherStr = str.substring(lineIndex + 1);
    console.log(otherStr);
  });
});

describe("测试websocket", () => {
  test("测试接收数据包", async (done) => {
    WebsocketClient.registryEventHandle("/hello", (event) => {
      console.log(event.unmarshal<string[]>());
      done();
    });

    WebsocketClient.registryWebsocketHook("close", (websocketClient) => {
      setTimeout(() => {
        websocketClient.reconnection();
      }, 3000);
    });

    WebsocketClient.registryWebsocketHook("open", async () => {
      console.log('open success');
      // const context = SocketContext.createSendMsgContext("hello",MsgMod.Mem,[
      //   {id:1,name:"test1",org:{name:"test1",code:"4566"}},
      //   {id:2,name:"test2",org:{name:"test2",code:"4567"}}
      // ])
      const context =SocketContext.createSendMsgContext("hello",MsgMod.Mem,{
        acd:"123",cs:"4454"
      })
      // console.log(context);
      try {
        const resultContext = await WebsocketClient.getConn().sendMsg(context);
        console.log(resultContext);
      } catch (e) {
        console.log(e);
      }
    });

    WebsocketClient.init();

  }, 30000000);
});