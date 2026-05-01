import { VideoView, useVideoPlayer } from "expo-video";
import type { StyleProp, ViewStyle } from "react-native";

type CommunityAttachmentVideoProps = {
  uri: string;
  style: StyleProp<ViewStyle>;
};

export function CommunityAttachmentVideo({ uri, style }: CommunityAttachmentVideoProps) {
  const player = useVideoPlayer(uri, (p) => {
    p.pause();
  });
  return <VideoView player={player} style={style} nativeControls contentFit="contain" />;
}
