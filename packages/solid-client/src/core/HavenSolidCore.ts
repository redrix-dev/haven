import { routeRealtimeEvent } from "@shared/core/routeRealtimeEvent";
import type { RealtimeMutationTarget } from "@shared/core/realtimeMutationTarget";
import {
  CommunitySolidCache,
  ChannelSolidCache,
  SocialSolidCache,
} from "@solid-client/data";

export class HavenSolidCore implements RealtimeMutationTarget {
  readonly communities = new CommunitySolidCache();
  readonly channels = new ChannelSolidCache();
  readonly messages = createMessageRegistry(this);
  readonly social = new SocialSolidCache();
}
