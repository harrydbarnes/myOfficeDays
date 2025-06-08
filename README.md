# myOfficeDays 📅

Create and share your office schedule with colleagues, friends, and family with ease. `myOfficeDays` is a simple, client-side web application that helps you define your weekly office pattern and share it with a single link. No sign-up required!

✨ Features

* **🎨 Multiple Schedules**: Create, name, and manage multiple office schedules. Perfect for tracking your own pattern, your team's, or even your partner's.
* **🧠 Smart Pattern Detection**: The app automatically detects your repeating work pattern as you click dates on the calendar. It supports:
    * **Constant**: The same days every week.
    * **A/B**: Alternating weeks.
    * **AA/BB**: Two weeks of one pattern, then two weeks of another.
    * **ABBA**: A four-week pattern where the schedule for week 1 repeats in week 4, and week 2 in week 3.
    * **Custom**: Any other four-week rotational pattern.
* **☀️ Special Periods**: Configure unique time periods with special rules:
    * **Summer Hours**: Set a custom finish time on specific days between a start and end date.
    * **Festive Break**: Block out a range of dates for holiday periods.
* **🔗 One-Click Sharing**: Generate a compressed, shareable link for your schedule. The link is short, making it easy to send via chat or email.
* **📂 Local Storage**: Your schedules are saved directly in your browser using `localStorage`, so your data stays with you. No backend, no database, no fuss.
* **😎 User-Friendly Interface**: A clean calendar view, a summary of your upcoming week, and simple toggles for viewing weekends and office day highlights.

## 🛠️ How It Works

`myOfficeDays` is a static web application built with vanilla HTML, CSS, and JavaScript. It's designed to be lightweight and run entirely in the user's browser.

### The Share Link Magic 🪄

The core of the sharing feature is its ability to encode an entire schedule into a short URL parameter. Here’s the process:

1.  **Compact Format**: The active schedule's data (name, pattern, dates, special periods) is converted into a compact JSON object to save space. For example:
    ```json
    {
      "n": "My Schedule",
      "pt": 1, // patternType: 'constant'
      "paD": "20240101", // patternAnchorDate
      "sL": "135|||", // selectionsList: Mon,Wed,Fri for week 1
      "sH": { "e": 1, "sD": "20240601", "eD": "20240831", "fT": "1400", "aD": "5" }, // summerHours
      "fB": { "e": 0 } // festiveBreak
    }
    ```
2.  **Compression**: This compact JSON string is then compressed using the **`pako.js`** library, which implements the DEFLATE algorithm. This dramatically reduces the size of the data.
3.  **Encoding**: The compressed data is converted into a Base64 string, which is URL-safe.
4.  **Generation**: The final string is appended to the URL as a query parameter (e.g., `?s=eNqrV...`).

When another user opens this link, the application performs these steps in reverse (decodes, decompresses, and parses) to display the shared schedule instantly.

## 🚀 Getting Started

Since this is a static website, you can load it yourself by simply clicking the URL link: https://harrydbarnes.github.io/myOfficeDays

For your own development or hosting, you can use any static file server. For example, using Python:
```bash
python -m http.server
```
Or with Node.js live-server:

```bash
npx live-server
```

📜 License

This project is intended for non-commercial use. The code is provided as-is.

The `pako.js` library used in this project is available under the MIT and Zlib licenses.
