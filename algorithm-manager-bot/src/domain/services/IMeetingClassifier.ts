import { MeetingClassification } from "../models/MeetingTypes.js";

export interface IMeetingClassifier {
  classify(transcript: string): Promise<MeetingClassification>;
}
