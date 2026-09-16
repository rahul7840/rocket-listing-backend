import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ListingGeneratorService } from './listing-generator.service';
import { GenerateListingDto } from './dto/generate-listing.dto';
import { ListingFieldsResponse } from './dto/listing-fields.response';

@ApiTags('Listing Generator')
@Controller('listing-generator')
export class ListingGeneratorController {
  constructor(
    private readonly listingGeneratorService: ListingGeneratorService,
  ) {}

  @Post('generate')
  @ApiOperation({
    summary:
      'Generate listing fields (product name, description, SKUs) from a recording',
  })
  @ApiResponse({ status: 201, type: ListingFieldsResponse })
  generate(@Body() dto: GenerateListingDto): Promise<ListingFieldsResponse> {
    return this.listingGeneratorService.generate(dto);
  }
}
