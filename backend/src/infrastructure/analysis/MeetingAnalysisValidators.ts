import { GeneratedMeetingData } from "../../domain/services/IMeetingAnalysisService.js";
import { ExtractionPointDto } from "./MeetingAnalysisResponseParser.js";
import {
  MeetingAnalysisErrorValidators,
  ALLOWED_DOCUMENTS,
  FORBIDDEN_TERMS,
  REQUIRED_PROMPT_SECTIONS
} from "./validators/MeetingAnalysisErrorValidators.js";
import {
  MeetingAnalysisQualityValidators,
  REFERENCE_HOURS_TABLE
} from "./validators/MeetingAnalysisQualityValidators.js";

export { ALLOWED_DOCUMENTS, FORBIDDEN_TERMS, REQUIRED_PROMPT_SECTIONS, REFERENCE_HOURS_TABLE };

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class MeetingAnalysisValidators {
  public static validate(
    data: GeneratedMeetingData,
    transcript?: string,
    extractionPoints?: ExtractionPointDto[]
  ): ValidationResult {
    const errors = MeetingAnalysisErrorValidators.validateErrors(data, transcript, extractionPoints);
    const warnings = MeetingAnalysisQualityValidators.validateWarnings(data, transcript, extractionPoints);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  public static sanitizeAndAutocorrect(data: GeneratedMeetingData): GeneratedMeetingData {
    return MeetingAnalysisQualityValidators.sanitizeAndAutocorrect(data);
  }
}
