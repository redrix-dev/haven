import { Box } from "@/components/ui/box";
import { FlatList } from "@/components/ui/flat-list";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { uxLabMessages } from "../UxLabData";
import { useUxLabStore } from "../UxLabStore";
import type { UxLabMessage } from "../UxLabTypes";

function UxLabMessageRow({ message }: { message: UxLabMessage }) {
  const isSystem = message.kind === "system";
  const isHighlight = message.kind === "highlight";

  return (
    <HStack
      space="sm"
      className={`mx-3 my-1 items-start rounded-2xl border px-3 py-2 ${
        isSystem
          ? "border-border-row bg-surface-inset"
          : isHighlight
            ? "border-border-selected bg-surface-message-row"
            : "border-transparent bg-transparent"
      }`}
    >
      <Box
        className={`h-9 w-9 items-center justify-center rounded-full ${
          isSystem ? "bg-muted" : "bg-primary"
        }`}
      >
        <Text
          bold
          className={
            isSystem ? "text-muted-foreground" : "text-primary-foreground"
          }
        >
          {message.author.charAt(0)}
        </Text>
      </Box>
      <VStack className="min-w-0 flex-1">
        <HStack space="xs" className="items-baseline">
          <Text size="sm" bold className="text-foreground">
            {message.author}
          </Text>
          <Text size="xs" className="text-muted-foreground">
            {message.timestamp}
          </Text>
        </HStack>
        <Text
          size="sm"
          className={isSystem ? "text-body-soft" : "text-muted-foreground"}
        >
          {message.body}
        </Text>
      </VStack>
    </HStack>
  );
}

export function UxLabMessageList() {
  const activeChannelId = useUxLabStore((s) => s.activeChannelId);
  const sentMessages = useUxLabStore((s) => s.sentMessages);
  const messages = [...uxLabMessages, ...sentMessages].filter(
    (message) => message.channelId === activeChannelId,
  );

  return (
    <FlatList
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <UxLabMessageRow message={item} />}
      contentContainerStyle={{ paddingVertical: 12 }}
      ListEmptyComponent={
        <VStack className="items-center px-6 py-12">
          <Text size="sm" className="text-center text-muted-foreground">
            No fake messages here yet. Switch channels or send a draft to test
            the feel.
          </Text>
        </VStack>
      }
    />
  );
}
