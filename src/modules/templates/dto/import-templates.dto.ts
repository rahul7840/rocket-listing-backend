import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { CreateTemplateDto } from './create-template.dto';

/** Most templates one import call carries; the extension sends larger sets in batches. */
export const IMPORT_BATCH_MAX = 50;

/** Templates the extension had saved in the browser before they were stored here (see TemplatesService.importMany). */
export class ImportTemplatesDto {
  @IsArray()
  @ArrayMaxSize(IMPORT_BATCH_MAX)
  @ValidateNested({ each: true })
  @Type(() => CreateTemplateDto)
  templates: CreateTemplateDto[];
}
