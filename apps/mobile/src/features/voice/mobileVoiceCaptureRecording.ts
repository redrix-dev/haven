type CaptureRecordingDriver = {
  start: () => Promise<void>;
  setPrepared: (enabled: boolean) => Promise<void>;
  stop: () => Promise<void>;
  isRecording: () => boolean;
};

/** Order native recording changes so a late start cannot outlive mute/leave. */
export class CaptureRecordingController {
  private pending = Promise.resolve();
  private desired: boolean | null = null;
  private request = 0;

  constructor(
    private readonly driver: CaptureRecordingDriver,
    private readonly onChange: (enabled: boolean) => void = () => {},
  ) {}

  setEnabled(enabled: boolean): Promise<void> {
    if (this.desired === enabled) return this.pending;
    this.desired = enabled;
    const request = ++this.request;
    this.pending = this.pending
      .catch(() => {})
      .then(async () => {
        if (enabled) {
          await this.driver.start(); // Requests mic permission before preparing.
          await this.driver.setPrepared(true);
        } else {
          try {
            await this.driver.setPrepared(false);
          } finally {
            await this.driver.stop();
          }
        }
        this.onChange(enabled);
      })
      .catch((error) => {
        if (request === this.request) this.desired = null;
        throw error;
      });
    return this.pending;
  }

  /** WebRTC can stop the device when its last RTP encoding closes. */
  ensureRecording(): Promise<void> {
    this.pending = this.pending
      .catch(() => {})
      .then(async () => {
        if (this.desired === true && !this.driver.isRecording()) {
          await this.driver.start();
          this.onChange(true);
        }
      });
    return this.pending;
  }
}
