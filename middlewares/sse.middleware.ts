import { Injectable, NestMiddleware } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';
import * as uuid from 'uuid/v4';
import { SseInterface } from '../interfaces';
import { logger } from '../utils';

@Injectable()
export class SSEMiddleware implements NestMiddleware {
  public use(req: IncomingMessage, res: ServerResponse & { sse: SseInterface; id: string }, next: () => void) {
    const SSE_RESPONSE_HEADER = {
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      'access-control-allow-origin': '*',
    };
    res.writeHead(200, SSE_RESPONSE_HEADER);
    res.id = uuid();
    // export a function to send server-side-events
    res.sse = function sse(data: string | Object) {
      try {
        const dataToSend: string = typeof data === 'string' ? data : JSON.stringify(data);
        res.write(`data:${dataToSend}\n\n`);

        // support running within the compression middleware
        if (res.flushHeaders && dataToSend.match(/\n\n$/)) {
          res.flushHeaders();
        }
      } catch (e) {
        logger.error(`res.write got error: ${e.message}`);
      }
    };

    // write 2kB of padding (for IE) and a reconnection timeout
    // then use res.sse to send to the client
    res.write(`:${Array(2049).join(' ')}\n`);

    // keep the connection open by sending a comment
    const keepAlive = setInterval(() => {
      res.sse(':keep-alive\n\n');
    }, 20000);

    // cleanup on close
    res.on('close', () => {
      clearInterval(keepAlive);
    });
    next();
  }
}
