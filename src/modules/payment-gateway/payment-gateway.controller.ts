import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { RazorpayWebhookService } from './razorpay-webhook.service';

@ApiTags('payment-gateway')
@Controller('payment-gateway')
export class PaymentGatewayController {
  constructor(private readonly razorpayWebhook: RazorpayWebhookService) {}

  /**
   * Set this URL in Razorpay Dashboard > Settings > Webhooks:
   *   https://<host>/api/payment-gateway/razorpay/webhook
   * Public on purpose - authenticity comes from the signature, not a JWT.
   */
  @Post('razorpay/webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Razorpay webhook receiver (called by Razorpay)' })
  @ApiHeader({ name: 'x-razorpay-signature', required: true })
  @ApiHeader({ name: 'x-razorpay-event-id', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      example: {
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_123' } } },
      },
    },
  })
  async razorpay(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
  ) {
    if (!req.rawBody) throw new BadRequestException('Raw body unavailable');
    const { duplicate } = await this.razorpayWebhook.handle(
      req.rawBody,
      signature,
      eventId,
    );
    return { received: true, duplicate };
  }
}
