import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Animated,
  Keyboard,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sendChatMessage, clearChatHistory } from '../services/api';
import { useTheme, GOLD } from '../theme';

// ─── Types ───────────────────────────────────────────────────────────

type Role = 'user' | 'assistant' | 'system';

interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  isError?: boolean;
}

// ─── Suggestion chips ────────────────────────────────────────────────

const SUGGESTIONS = [
  'What books should I read next?',
  'Recommend a philosophy book',
  'Summarise my shelf interests',
  'Best sci-fi novels of all time?',
  'Compare Camus and Sartre',
];

// ─── Helpers ─────────────────────────────────────────────────────────

let _msgId = 0;
function makeId() {
  return `m_${++_msgId}_${Date.now()}`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Typing indicator dots ───────────────────────────────────────────

function TypingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: -6,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(600),
        ])
      );

    const a1 = bounce(dot1, 0);
    const a2 = bounce(dot2, 150);
    const a3 = bounce(dot3, 300);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, []);

  return (
    <View style={s.dotsRow}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={[s.dot, { transform: [{ translateY: dot }] }]}
        />
      ))}
    </View>
  );
}

// ─── Markdown Parser & Structured Renderer ───────────────────────────

type MarkdownBlock =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string; isItem?: boolean; itemNum?: string }
  | { type: 'bullet'; text: string; indent?: number }
  | { type: 'numbered'; num: string; text: string }
  | { type: 'quote'; text: string }
  | { type: 'divider' }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'paragraph'; text: string };

function parseMarkdownBlocks(rawText: string): MarkdownBlock[] {
  const lines = rawText.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line
    if (!trimmed) {
      i++;
      continue;
    }

    // Markdown Table check: line starts and ends with '|'
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
      const tableLines: string[] = [trimmed];
      let j = i + 1;
      while (
        j < lines.length &&
        lines[j].trim().startsWith('|') &&
        lines[j].trim().endsWith('|')
      ) {
        tableLines.push(lines[j].trim());
        j++;
      }

      if (tableLines.length >= 2) {
        const headerCells = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());

        // Check if row 1 is delimiter e.g. |---|---|
        let dataStart = 1;
        if (/^\|[\s\-:|]+\|$/.test(tableLines[1])) {
          dataStart = 2;
        }

        const rows: string[][] = [];
        for (let r = dataStart; r < tableLines.length; r++) {
          const rowCells = tableLines[r]
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim());
          if (rowCells.some((c) => c.length > 0)) {
            rows.push(rowCells);
          }
        }

        if (headerCells.length > 0) {
          blocks.push({ type: 'table', headers: headerCells, rows });
          i = j;
          continue;
        }
      }
    }

    // Horizontal Divider
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'divider' });
      i++;
      continue;
    }

    // Headings
    if (/^#\s+(.*)/.test(trimmed)) {
      blocks.push({ type: 'h1', text: trimmed.replace(/^#\s+/, '') });
      i++;
      continue;
    }
    if (/^##\s+(.*)/.test(trimmed)) {
      blocks.push({ type: 'h2', text: trimmed.replace(/^##\s+/, '') });
      i++;
      continue;
    }
    if (/^###\s+(.*)/.test(trimmed)) {
      const content = trimmed.replace(/^###\s+/, '');
      const itemMatch = content.match(/^(\d+)[\.\)]\s*(.*)/);
      if (itemMatch) {
        blocks.push({
          type: 'h3',
          text: itemMatch[2],
          isItem: true,
          itemNum: itemMatch[1],
        });
      } else {
        blocks.push({ type: 'h3', text: content });
      }
      i++;
      continue;
    }

    // Numbered list item: "1. text" or "1) text"
    const numMatch = trimmed.match(/^(\d+)[\.\)]\s+(.*)/);
    if (numMatch) {
      blocks.push({ type: 'numbered', num: numMatch[1], text: numMatch[2] });
      i++;
      continue;
    }

    const leadingSpaces = line.search(/\S/);
    const isIndented = leadingSpaces >= 2;

    // Bullet list: "- text", "* text", "• text"
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)/);
    if (bulletMatch) {
      blocks.push({
        type: 'bullet',
        text: bulletMatch[1],
        indent: isIndented ? 16 : 0,
      });
      i++;
      continue;
    }

    // Indented sub-line (e.g. "   *Why it matches your taste:* ...")
    if (isIndented) {
      blocks.push({
        type: 'bullet',
        text: trimmed,
        indent: 16,
      });
      i++;
      continue;
    }

    // Blockquote: "> quote"
    if (/^>\s?(.*)/.test(trimmed)) {
      blocks.push({ type: 'quote', text: trimmed.replace(/^>\s?/, '') });
      i++;
      continue;
    }

    // Normal paragraph line
    blocks.push({ type: 'paragraph', text: trimmed });
    i++;
  }

  return blocks;
}

// Inline formatting tokeniser: **bold**, *italic*, `code`
function renderInlineText(
  text: string,
  baseColor: string,
  isBoldBase = false
): React.ReactNode[] {
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(regex).filter(Boolean);

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const content = part.slice(2, -2);
      const isKey = content.trim().endsWith(':');
      return (
        <Text
          key={idx}
          style={{
            fontWeight: '700',
            color: isKey ? GOLD : baseColor,
          }}
        >
          {content}
        </Text>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const content = part.slice(1, -1);
      const isKey = content.trim().endsWith(':');
      return (
        <Text
          key={idx}
          style={{
            fontStyle: 'italic',
            color: isKey ? GOLD : baseColor,
            fontWeight: isBoldBase || isKey ? '700' : '400',
          }}
        >
          {content}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <Text
          key={idx}
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            fontSize: 12,
            color: GOLD,
            backgroundColor: 'rgba(200, 169, 110, 0.14)',
            borderRadius: 4,
            paddingHorizontal: 4,
            paddingVertical: 1,
          }}
        >
          {part.slice(1, -1)}
        </Text>
      );
    }
    return (
      <Text
        key={idx}
        style={{
          color: baseColor,
          fontWeight: isBoldBase ? '700' : '400',
        }}
      >
        {part}
      </Text>
    );
  });
}

function MarkdownRenderer({
  text,
  color,
}: {
  text: string;
  color: string;
}) {
  const { theme } = useTheme();
  const blocks = parseMarkdownBlocks(text);

  return (
    <View style={s.mdContainer}>
      {blocks.map((block, bi) => {
        switch (block.type) {
          case 'h1':
            return (
              <Text
                key={bi}
                style={[s.mdH1, { color: GOLD }]}
              >
                {renderInlineText(block.text, GOLD, true)}
              </Text>
            );

          case 'h2':
            return (
              <View key={bi} style={s.mdH2Wrapper}>
                <View style={[s.mdH2Indicator, { backgroundColor: GOLD }]} />
                <Text style={[s.mdH2Text, { color: theme.text }]}>
                  {renderInlineText(block.text, theme.text, true)}
                </Text>
              </View>
            );

          case 'h3':
            if (block.isItem && block.itemNum) {
              return (
                <View key={bi} style={s.mdItemHeader}>
                  <View style={[s.mdItemBadge, { backgroundColor: `${GOLD}22`, borderColor: `${GOLD}60` }]}>
                    <Text style={[s.mdItemBadgeText, { color: GOLD }]}>
                      {block.itemNum}
                    </Text>
                  </View>
                  <Text style={[s.mdItemTitle, { color: theme.text }]}>
                    {renderInlineText(block.text, theme.text, true)}
                  </Text>
                </View>
              );
            }
            return (
              <Text key={bi} style={[s.mdH3, { color: theme.text }]}>
                {renderInlineText(block.text, theme.text, true)}
              </Text>
            );

          case 'numbered':
            return (
              <View key={bi} style={s.mdNumberedRow}>
                <View style={[s.mdNumPill, { backgroundColor: `${GOLD}18` }]}>
                  <Text style={[s.mdNumPillText, { color: GOLD }]}>
                    {block.num}
                  </Text>
                </View>
                <Text style={[s.mdLineText, { color }]}>
                  {renderInlineText(block.text, color)}
                </Text>
              </View>
            );

          case 'bullet':
            return (
              <View
                key={bi}
                style={[
                  s.mdBulletRow,
                  block.indent ? { paddingLeft: block.indent } : undefined,
                ]}
              >
                <Text style={[s.mdBulletDot, { color: GOLD }]}>•</Text>
                <Text style={[s.mdLineText, { color }]}>
                  {renderInlineText(block.text, color)}
                </Text>
              </View>
            );

          case 'quote':
            return (
              <View
                key={bi}
                style={[
                  s.mdQuoteBox,
                  {
                    borderLeftColor: GOLD,
                    backgroundColor: `${GOLD}10`,
                  },
                ]}
              >
                <Text style={[s.mdQuoteText, { color: theme.muted }]}>
                  {renderInlineText(block.text, theme.muted)}
                </Text>
              </View>
            );

          case 'divider':
            return (
              <View
                key={bi}
                style={[s.mdDivider, { backgroundColor: theme.border }]}
              />
            );

          case 'table':
            return (
              <ScrollView
                key={bi}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.tableScroll}
                contentContainerStyle={s.tableScrollContent}
              >
                <View
                  style={[
                    s.tableBox,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                    },
                  ]}
                >
                  {/* Table Header */}
                  <View
                    style={[
                      s.tableHeaderRow,
                      {
                        backgroundColor: theme.surfaceLight,
                        borderBottomColor: theme.border,
                      },
                    ]}
                  >
                    {block.headers.map((h, hi) => {
                      const colWidth =
                        hi === 0 ? 140 : hi === 1 ? 220 : 130;
                      return (
                        <View
                          key={hi}
                          style={[
                            s.tableCell,
                            {
                              width: colWidth,
                              borderRightColor: theme.border,
                              borderRightWidth:
                                hi === block.headers.length - 1 ? 0 : 1,
                            },
                          ]}
                        >
                          <Text style={[s.tableHeaderText, { color: GOLD }]}>
                            {h}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  {/* Table Rows */}
                  {block.rows.map((row, ri) => (
                    <View
                      key={ri}
                      style={[
                        s.tableRow,
                        {
                          backgroundColor:
                            ri % 2 === 1 ? `${GOLD}08` : 'transparent',
                          borderBottomColor: theme.border,
                          borderBottomWidth:
                            ri === block.rows.length - 1 ? 0 : StyleSheet.hairlineWidth,
                        },
                      ]}
                    >
                      {row.map((cell, ci) => {
                        const colWidth =
                          ci === 0 ? 140 : ci === 1 ? 220 : 130;
                        return (
                          <View
                            key={ci}
                            style={[
                              s.tableCell,
                              {
                                width: colWidth,
                                borderRightColor: theme.border,
                                borderRightWidth:
                                  ci === row.length - 1 ? 0 : 1,
                              },
                            ]}
                          >
                            <Text
                              style={[s.tableCellText, { color: theme.text }]}
                            >
                              {renderInlineText(cell, theme.text)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
            );

          case 'paragraph':
          default:
            return (
              <Text key={bi} style={[s.mdParagraph, { color }]}>
                {renderInlineText(block.text, color)}
              </Text>
            );
        }
      })}
    </View>
  );
}

// ─── Single message bubble ────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const { theme } = useTheme();
  const isUser = msg.role === 'user';

  if (msg.role === 'system') {
    return (
      <View style={s.systemMsgRow}>
        <Text style={[s.systemMsg, { color: theme.muted }]}>
          {msg.content}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        s.bubbleRow,
        isUser ? s.bubbleRowUser : s.bubbleRowAssistant,
      ]}
    >
      {/* Avatar */}
      {!isUser && (
        <View
          style={[
            s.avatar,
            { backgroundColor: `${GOLD}20`, borderColor: `${GOLD}40` },
          ]}
        >
          <Ionicons name="sparkles" size={14} color={GOLD} />
        </View>
      )}

      <View
        style={[
          s.bubble,
          isUser
            ? [s.bubbleUser, { backgroundColor: GOLD }]
            : [
                s.bubbleAssistant,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ],
          msg.isError && {
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
          },
        ]}
      >
        {isUser ? (
          <Text style={[s.bubbleText, { color: '#0d0d10' }]}>
            {msg.content}
          </Text>
        ) : (
          <MarkdownRenderer
            text={msg.content}
            color={msg.isError ? '#ef4444' : theme.text}
          />
        )}
        <Text
          style={[
            s.timestamp,
            {
              color: isUser
                ? 'rgba(13,13,16,0.55)'
                : theme.subtle,
              textAlign: isUser ? 'right' : 'left',
            },
          ]}
        >
          {formatTime(msg.timestamp)}
        </Text>
      </View>

      {isUser && (
        <View
          style={[
            s.avatar,
            { backgroundColor: theme.surfaceLight, borderColor: theme.border },
          ]}
        >
          <Ionicons name="person" size={14} color={theme.muted} />
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────

export default function ChatScreen() {
  const { theme } = useTheme();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: makeId(),
      role: 'assistant',
      content:
        "Hello! I'm **Booklib AI**, your personal literary companion.\n\nI can see your shelf and know what you're reading. Ask me for personalized recommendations, philosophical deep-dives, book reviews, or author comparisons!",
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // Monitor keyboard visibility so text bar stays above bottom navigation bar
  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () =>
      setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(hideEvent, () =>
      setIsKeyboardVisible(false)
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollToBottom = useCallback((delay = 80) => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, delay);
  }, []);

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    const full: Message = { ...msg, id: makeId(), timestamp: new Date() };
    setMessages((prev) => [...prev, full]);
    return full;
  }, []);

  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? inputText).trim();
      if (!content || isTyping) return;

      setInputText('');
      setShowSuggestions(false);
      setIsTyping(true);

      addMessage({ role: 'user', content });
      scrollToBottom();

      // Cancel any previous in-flight request
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const data = await sendChatMessage(content, ctrl.signal);
        addMessage({ role: 'assistant', content: data.response });
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        const errText =
          err.message?.includes('503') || err.message?.includes('AI')
            ? err.message
            : 'Unable to reach Booklib AI. Please try again.';
        addMessage({ role: 'assistant', content: errText, isError: true });
      } finally {
        setIsTyping(false);
        scrollToBottom(120);
      }
    },
    [inputText, isTyping, addMessage, scrollToBottom]
  );

  const handleClear = useCallback(async () => {
    abortRef.current?.abort();
    setIsTyping(false);
    setMessages([
      {
        id: makeId(),
        role: 'assistant',
        content:
          "Chat cleared! I'm ready for a fresh conversation. What would you like to explore?",
        timestamp: new Date(),
      },
    ]);
    setShowSuggestions(true);
    try {
      await clearChatHistory();
    } catch {
      // non-critical
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => <MessageBubble msg={item} />,
    []
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  // Bottom padding calculation:
  // Tab bar height is 64px + bottom offset (24px iOS, 16px Android/Web) = 88px / 80px.
  // When keyboard is closed, add padding so the text bar rests directly above the floating tab bar!
  const bottomBarPadding = isKeyboardVisible
    ? Platform.OS === 'ios'
      ? 12
      : 8
    : Platform.OS === 'ios'
    ? 96
    : 84;

  const listBottomPadding = isKeyboardVisible
    ? 24
    : showSuggestions
    ? 220
    : 160;

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* ── Messages list ──────────────────────────────────────────── */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={[
          s.listContent,
          { paddingBottom: listBottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollToBottom(50)}
        ListFooterComponent={
          isTyping ? (
            <View
              style={[
                s.typingBubble,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <View
                style={[
                  s.avatar,
                  { backgroundColor: `${GOLD}20`, borderColor: `${GOLD}40` },
                ]}
              >
                <Ionicons name="sparkles" size={14} color={GOLD} />
              </View>
              <View
                style={[
                  s.typingIndicator,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <TypingDots />
              </View>
            </View>
          ) : null
        }
      />

      {/* ── Suggestion chips ───────────────────────────────────────── */}
      {showSuggestions && (
        <View
          style={[
            s.suggestionsWrapper,
            { backgroundColor: theme.bg },
          ]}
        >
          <FlatList
            horizontal
            data={SUGGESTIONS}
            keyExtractor={(item) => item}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.suggestionsPills}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  s.suggestionChip,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => handleSend(item)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="chatbubble-outline"
                  size={12}
                  color={GOLD}
                  style={{ marginRight: 5 }}
                />
                <Text style={[s.suggestionText, { color: theme.text }]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* ── Input bar ─────────────────────────────────────────────── */}
      <View
        style={[
          s.inputBar,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            paddingBottom: bottomBarPadding,
            shadowColor: '#000',
          },
        ]}
      >
        {/* Clear button */}
        <TouchableOpacity
          style={[
            s.clearBtn,
            { backgroundColor: theme.surfaceLight, borderColor: theme.border },
          ]}
          onPress={handleClear}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={17} color={theme.muted} />
        </TouchableOpacity>

        {/* Text input */}
        <TextInput
          ref={inputRef}
          style={[s.input, { color: theme.text }]}
          placeholder="Ask about books, authors, genres…"
          placeholderTextColor={theme.muted}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={() => handleSend()}
          returnKeyType="send"
          multiline
          maxLength={2000}
          blurOnSubmit={false}
        />

        {/* Send button */}
        <TouchableOpacity
          style={[
            s.sendBtn,
            {
              backgroundColor:
                inputText.trim().length > 0 && !isTyping
                  ? GOLD
                  : theme.surfaceLight,
            },
          ]}
          onPress={() => handleSend()}
          disabled={isTyping || inputText.trim().length === 0}
          activeOpacity={0.8}
        >
          {isTyping ? (
            <ActivityIndicator size="small" color={GOLD} />
          ) : (
            <Ionicons
              name="arrow-up"
              size={18}
              color={
                inputText.trim().length > 0
                  ? theme.bg
                  : theme.subtle
              }
            />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },

  listContent: {
    paddingTop: 16,
    paddingHorizontal: 12,
  },

  // Bubbles
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: 14,
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '100%',
  },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },

  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    maxWidth: '82%',
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    maxWidth: '92%',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  timestamp: { fontSize: 10, marginTop: 6, opacity: 0.7 },

  // Avatars
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginBottom: 2,
  },

  // System message
  systemMsgRow: {
    alignItems: 'center',
    marginVertical: 10,
    paddingHorizontal: 16,
  },
  systemMsg: {
    fontSize: 12,
    fontStyle: 'italic',
  },

  // Typing
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 12,
  },
  typingIndicator: {
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: GOLD,
    opacity: 0.85,
  },

  // Suggestions
  suggestionsWrapper: {
    paddingVertical: 8,
  },
  suggestionsPills: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center',
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  clearBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginBottom: 2,
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    maxHeight: 120,
    paddingTop: Platform.OS === 'android' ? 8 : 10,
    paddingBottom: Platform.OS === 'android' ? 8 : 10,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginBottom: 2,
  },

  // ─── Markdown Renderer Styles ────────────────────────────────────────
  mdContainer: {
    gap: 3,
  },
  mdH1: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  mdH2Wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 6,
    gap: 6,
  },
  mdH2Indicator: {
    width: 3,
    height: 16,
    borderRadius: 2,
  },
  mdH2Text: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  mdH3: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 4,
  },
  mdItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
    gap: 7,
  },
  mdItemBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mdItemBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mdItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  mdNumberedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginBottom: 4,
  },
  mdNumPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginTop: 2,
  },
  mdNumPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  mdBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 3,
    gap: 6,
  },
  mdBulletDot: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: -1,
  },
  mdLineText: {
    fontSize: 13.5,
    lineHeight: 20,
    flex: 1,
  },
  mdQuoteBox: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 5,
    marginVertical: 5,
    borderRadius: 4,
  },
  mdQuoteText: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  mdDivider: {
    height: 1,
    marginVertical: 8,
    opacity: 0.6,
  },
  mdParagraph: {
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 3,
  },

  // Markdown Table styles
  tableScroll: {
    marginVertical: 8,
  },
  tableScrollContent: {
    paddingRight: 4,
  },
  tableBox: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 2,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableCell: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  tableCellText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
});
