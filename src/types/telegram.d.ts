interface TelegramWebAppUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

interface TelegramWebAppChat {
  id: number;
  type: "group" | "supergroup" | "channel";
  title: string;
  username?: string;
  photo_url?: string;
}

interface ThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  bottom_bar_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  section_separator_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

interface MainButton {
  text: string;
  color: string;
  textColor: string;
  isVisible: boolean;
  isActive: boolean;
  isProgressVisible: boolean;
  setText(text: string): MainButton;
  onClick(callback: () => void): MainButton;
  offClick(callback: () => void): MainButton;
  show(): MainButton;
  hide(): MainButton;
  enable(): MainButton;
  disable(): MainButton;
  showProgress(leaveActive?: boolean): MainButton;
  hideProgress(): MainButton;
  setParams(params: {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
    has_shine_effect?: boolean;
  }): MainButton;
}

interface BackButton {
  isVisible: boolean;
  onClick(callback: () => void): BackButton;
  offClick(callback: () => void): BackButton;
  show(): BackButton;
  hide(): BackButton;
}

interface HapticFeedback {
  impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): HapticFeedback;
  notificationOccurred(type: "error" | "success" | "warning"): HapticFeedback;
  selectionChanged(): HapticFeedback;
}

interface PopupParams {
  title?: string;
  message: string;
  buttons?: Array<{
    id?: string;
    type?: "default" | "ok" | "close" | "cancel" | "destructive";
    text?: string;
  }>;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: TelegramWebAppUser;
    receiver?: TelegramWebAppUser;
    chat?: TelegramWebAppChat;
    chat_type?: string;
    chat_instance?: string;
    start_param?: string;
    can_send_after?: number;
    auth_date: number;
    hash: string;
  };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: ThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  bottomBarColor: string;
  isClosingConfirmationEnabled: boolean;
  isVerticalSwipesEnabled: boolean;
  MainButton: MainButton;
  BackButton: BackButton;
  HapticFeedback: HapticFeedback;

  ready(): void;
  expand(): void;
  close(): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  enableVerticalSwipes(): void;
  disableVerticalSwipes(): void;
  setHeaderColor(color: "bg_color" | "secondary_bg_color" | string): void;
  setBackgroundColor(color: "bg_color" | "secondary_bg_color" | string): void;
  setBottomBarColor(color: "bg_color" | "secondary_bg_color" | "bottom_bar_bg_color" | string): void;
  showPopup(params: PopupParams, callback?: (buttonId: string) => void): void;
  showAlert(message: string, callback?: () => void): void;
  showConfirm(message: string, callback?: (confirmed: boolean) => void): void;
  onEvent(eventType: string, callback: () => void): void;
  offEvent(eventType: string, callback: () => void): void;
  sendData(data: string): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
}

interface Telegram {
  WebApp: TelegramWebApp;
}

interface Window {
  Telegram?: Telegram;
}
