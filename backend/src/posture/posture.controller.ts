import { Controller, Get, Param } from '@nestjs/common';
import { SessionService } from '../session/session.service';

@Controller('api/postures')
export class PostureController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  async getAllPostures() {
    const steps = await this.sessionService.getAllPostureSteps();
    return steps.map((step) => ({
      id: step.id,
      stepOrder: step.stepOrder,
      postureLabel: step.postureLabel,
      displayName: step.displayName,
      instructions: step.instructions,
      countdownSeconds: step.countdownSeconds,
      recordingDurationSeconds: step.recordingDurationSeconds,
    }));
  }

  @Get(':sessionId/next')
  async getNextPosture(@Param('sessionId') sessionId: string) {
    const step = await this.sessionService.getNextPostureStep(sessionId);
    
    if (!step) {
      return { completed: true, step: null };
    }

    return {
      completed: false,
      step: {
        id: step.id,
        stepOrder: step.stepOrder,
        postureLabel: step.postureLabel,
        displayName: step.displayName,
        instructions: step.instructions,
        countdownSeconds: step.countdownSeconds,
        recordingDurationSeconds: step.recordingDurationSeconds,
      },
    };
  }
}
