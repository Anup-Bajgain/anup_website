 #include <BleKeyboard.h>
#include <ESP32Encoder.h>

// --- Configuration ---
#define DEVICE_NAME "PROTON"

// Button Pins (6 function buttons)
const int BUTTON_PINS[] = {13, 12, 14, 25, 26, 27}; // B1 to B6
const int NUM_BUTTONS = sizeof(BUTTON_PINS) / sizeof(BUTTON_PINS[0]);

#define MODE_SWITCH_PIN 33  // 7th switch for changing modes
#define ROTARY_SW_PIN   21  // Rotary encoder push switch
#define ROTARY_CLK_PIN  19
#define ROTARY_DT_PIN   18

// --- Global Variables ---
BleKeyboard bleKeyboard(DEVICE_NAME, "MyCompany", 100);
ESP32Encoder rotaryEncoder;

long oldRotaryPosition = 0;

bool buttonStates[NUM_BUTTONS];
bool lastButtonStates[NUM_BUTTONS];
unsigned long lastDebounceTime[NUM_BUTTONS];

bool modeSwitchState = true;
bool lastModeSwitchState = true;
unsigned long lastModeSwitchDebounceTime = 0;

bool rotarySwitchState = false;
bool lastRotarySwitchState = false;
unsigned long lastRotarySwitchDebounceTime = 0;

const unsigned long DEBOUNCE_DELAY = 50;

// Mode Tracking
enum Mode {
  MODE_MEDIA,
  MODE_PRODUCTIVITY,
  MODE_CUSTOM
};
Mode currentMode = MODE_MEDIA;

// Rotary Control Modes
enum RotaryMode {
  ROTARY_VOLUME,
  ROTARY_SCROLL
};
RotaryMode rotaryMode = ROTARY_VOLUME;

// --- Setup ---
void setup() {
  Serial.begin(115200);
  Serial.println("Starting ESP32 SimplePad...");

  // Initialize Buttons
  for (int i = 0; i < NUM_BUTTONS; i++) {
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);
    buttonStates[i] = true;
    lastButtonStates[i] = true;
    lastDebounceTime[i] = 0;
  }

  pinMode(MODE_SWITCH_PIN, INPUT_PULLUP);
  pinMode(ROTARY_SW_PIN, INPUT_PULLUP);

  pinMode(ROTARY_CLK_PIN, INPUT_PULLUP);
  pinMode(ROTARY_DT_PIN, INPUT_PULLUP);

  rotaryEncoder.attachHalfQuad(ROTARY_DT_PIN, ROTARY_CLK_PIN);
  rotaryEncoder.setCount(0);
  oldRotaryPosition = 0;

  Serial.println("Starting BLE HID Keyboard...");
  bleKeyboard.begin();
  Serial.println("BLE HID Keyboard Started. Waiting for connection...");
}

// --- Loop ---
void loop() {
  if (bleKeyboard.isConnected()) {
    handleButtons();
    handleRotaryEncoder();
    handleRotarySwitch();
    handleModeSwitch();
  } else {
    Serial.println("Waiting for BLE connection...");
    delay(1000);
  }
  delay(10);
}

// --- Button Handler ---
void handleButtons() {
  for (int i = 0; i < NUM_BUTTONS; i++) {
    bool reading = digitalRead(BUTTON_PINS[i]);
    if (reading != lastButtonStates[i]) {
      lastDebounceTime[i] = millis();
    }
    if ((millis() - lastDebounceTime[i]) > DEBOUNCE_DELAY) {
      if (reading != buttonStates[i]) {
        buttonStates[i] = reading;
        if (buttonStates[i] == LOW) {
          Serial.print("Button "); Serial.print(i + 1); Serial.println(" pressed");
          executeButtonAction(i);
        }
      }
    }
    lastButtonStates[i] = reading;
  }
}

// --- Rotary Encoder Handler ---
void handleRotaryEncoder() {
  long newPosition = rotaryEncoder.getCount();
  if (newPosition != oldRotaryPosition) {
    if (newPosition > oldRotaryPosition) {
      if (rotaryMode == ROTARY_VOLUME) {
        Serial.println("Rotary CW - Volume Up");
        bleKeyboard.write(KEY_MEDIA_VOLUME_UP);
      } else {
        Serial.println("Rotary CW - Scroll Right");
        bleKeyboard.write(KEY_RIGHT_ARROW);
      }
    } else {
      if (rotaryMode == ROTARY_VOLUME) {
        Serial.println("Rotary CCW - Volume Down");
        bleKeyboard.write(KEY_MEDIA_VOLUME_DOWN);
      } else {
        Serial.println("Rotary CCW - Scroll Left");
        bleKeyboard.write(KEY_LEFT_ARROW);
      }
    }
    oldRotaryPosition = newPosition;
  }
}

// --- Rotary Push Button (Toggle Rotary Mode) ---
void handleRotarySwitch() {
  bool reading = digitalRead(ROTARY_SW_PIN);
  if (reading != lastRotarySwitchState) {
    lastRotarySwitchDebounceTime = millis();
  }
  if ((millis() - lastRotarySwitchDebounceTime) > DEBOUNCE_DELAY) {
    if (reading != rotarySwitchState) {
      rotarySwitchState = reading;
      if (rotarySwitchState == LOW) {
        rotaryMode = (rotaryMode == ROTARY_VOLUME) ? ROTARY_SCROLL : ROTARY_VOLUME;
        Serial.print("Rotary Mode switched to: ");
        Serial.println(rotaryMode == ROTARY_VOLUME ? "Volume" : "Scroll");
      }
    }
  }
  lastRotarySwitchState = reading;
}

// --- Mode Switch Handler ---
void handleModeSwitch() {
  bool reading = digitalRead(MODE_SWITCH_PIN);
  if (reading != lastModeSwitchState) {
    lastModeSwitchDebounceTime = millis();
  }
  if ((millis() - lastModeSwitchDebounceTime) > DEBOUNCE_DELAY) {
    if (reading != modeSwitchState) {
      modeSwitchState = reading;
      if (modeSwitchState == LOW) {
        currentMode = static_cast<Mode>((currentMode + 1) % 3);
        Serial.print("Switched Mode: ");
        switch (currentMode) {
          case MODE_MEDIA: Serial.println("Media"); break;
          case MODE_PRODUCTIVITY: Serial.println("Productivity"); break;
          case MODE_CUSTOM: Serial.println("Custom"); break;
        }
      }
    }
  }
  lastModeSwitchState = reading;
}

// --- Button Actions Based on Mode ---
void executeButtonAction(int buttonIndex) {
  Serial.print("Executing action for button "); Serial.print(buttonIndex + 1);
  Serial.print(" in mode: ");
  switch (currentMode) {
    case MODE_MEDIA: Serial.println("Media"); break;
    case MODE_PRODUCTIVITY: Serial.println("Productivity"); break;
    case MODE_CUSTOM: Serial.println("Custom"); break;
  }

  switch (currentMode) {
    case MODE_MEDIA:
      switch (buttonIndex) {
        case 0: bleKeyboard.write(KEY_MEDIA_PREVIOUS_TRACK); break;
        case 1: bleKeyboard.write(KEY_MEDIA_PLAY_PAUSE); break;
        case 2: bleKeyboard.write(KEY_MEDIA_NEXT_TRACK); break;
        case 3: bleKeyboard.write(KEY_MEDIA_MUTE); break;
        case 4: bleKeyboard.press(KEY_LEFT_ALT); bleKeyboard.press(KEY_TAB); delay(50); bleKeyboard.release(KEY_TAB); bleKeyboard.release(KEY_LEFT_ALT); Serial.println("Alt+Tab"); break;
        case 5: bleKeyboard.write(KEY_MEDIA_STOP); break;
      }
      break;

    case MODE_PRODUCTIVITY:
      switch (buttonIndex) {
        case 0: bleKeyboard.press(KEY_LEFT_CTRL); bleKeyboard.press('c'); delay(50); bleKeyboard.releaseAll(); Serial.println("Copy"); break;
        case 1: bleKeyboard.press(KEY_LEFT_CTRL); bleKeyboard.press('v'); delay(50); bleKeyboard.releaseAll(); Serial.println("Paste"); break;
        case 2: bleKeyboard.press(KEY_LEFT_CTRL); bleKeyboard.press('x'); delay(50); bleKeyboard.releaseAll(); Serial.println("Cut"); break;
        case 3: bleKeyboard.press(KEY_LEFT_CTRL); bleKeyboard.press('z'); delay(50); bleKeyboard.releaseAll(); Serial.println("Undo"); break;
        case 4: bleKeyboard.press(KEY_LEFT_ALT); bleKeyboard.press(KEY_TAB); delay(50); bleKeyboard.release(KEY_TAB); bleKeyboard.release(KEY_LEFT_ALT); Serial.println("Alt+Tab"); break;
        case 5: bleKeyboard.press(KEY_LEFT_CTRL); bleKeyboard.press('s'); delay(50); bleKeyboard.releaseAll(); Serial.println("Save"); break;
      }
      break;

    case MODE_CUSTOM:
      switch (buttonIndex) {
        case 0:  // Open YouTube
          bleKeyboard.press(KEY_LEFT_GUI);  // Win + R
          bleKeyboard.press('r');
          delay(100);
          bleKeyboard.releaseAll();
        
          delay(300);  // Wait for Run dialog
          bleKeyboard.print("https://www.youtube.com");
          delay(100);
          bleKeyboard.write(KEY_RETURN);
          Serial.println("Opening YouTube");
          break;
        
        case 1:  // Open WhatsApp Web
          bleKeyboard.press(KEY_LEFT_GUI);
          bleKeyboard.press('r');
          delay(100);
          bleKeyboard.releaseAll();
        
          delay(300);
          bleKeyboard.print("https://web.whatsapp.com");
          delay(100);
          bleKeyboard.write(KEY_RETURN);
          Serial.println("Opening WhatsApp Web");
          break;
        
        case 2:  // Open Facebook Messenger
          bleKeyboard.press(KEY_LEFT_GUI);
          bleKeyboard.press('r');
          delay(100);
          bleKeyboard.releaseAll();
        
          delay(300);
          bleKeyboard.print("https://www.messenger.com");
          delay(100);
          bleKeyboard.write(KEY_RETURN);
          Serial.println("Opening Messenger");
          break;
        
        case 3:  // Example: Open Notepad (or replace with something else)
          bleKeyboard.press(KEY_LEFT_GUI);  // Win key
          bleKeyboard.press('r');           // + R to open Run
          delay(100);
          bleKeyboard.releaseAll();
          
          delay(300);  // Wait for the Run dialog
          bleKeyboard.print("D:\FOSSEE\FellowShip\VIO");
          delay(100);
          bleKeyboard.write(KEY_RETURN);    // Press Enter to open the folder
        case 4: 
          bleKeyboard.press(KEY_LEFT_GUI);
          bleKeyboard.press('r');
          delay(100);
          bleKeyboard.releaseAll();
        
          delay(300);
          bleKeyboard.print("https://mail.google.com/mail/u/2/#inbox");
          delay(100);
          bleKeyboard.write(KEY_RETURN);
          Serial.println("Opening Mail");
          break;
        case 5:
          bleKeyboard.print("good night");
          delay(100);
          bleKeyboard.write(KEY_RETURN);
          delay(100);
          bleKeyboard.print("have a sweet dream");
          bleKeyboard.write(KEY_RETURN);
          break;          

      }
      break;
  }
}
