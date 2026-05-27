Comments Overview

https://vercel.com/docs/comments

Summary for me all commenting features

mateuszpaulski
Based on the Comments Overview documentation, here are the key commenting features:

Core Functionality

Comments allow teams and invited participants to give direct feedback directly on preview deployments through the Vercel Toolbar. You can add comments to any part of the UI, and they open discussion threads for collaborative feedback.

Key Features

Comments are enabled by default on all preview deployments for all account plans, completely free of charge
Pull request owners receive email notifications when new comments are created
Comment creators and participants get email alerts for new activity in their threads
Team members can leave comments on previews by default
On Pro and Enterprise plans, you can invite external users to view deployments and leave comments
Comments can be linked to Slack threads for integrated discussions
When new preview deployments are generated, a popup prompts you to refresh your view
How to Use

Comments are part of the Vercel Toolbar, which must be active to view comments. You can leave a comment by opening the toolbar menu, selecting Comment (or the comment bubble icon), then clicking on the page or highlighting text where you want to place your comment.

Additional Options

For frequent comment users, you can download the browser extension and enable Always Activate in Preferences to have the toolbar always active without needing to manually click to enable it.

The documentation also references more detailed guides on enabling/disabling comments, using comments, managing comments, and integrations if you need deeper information on any of these areas.

write me details how to use it

mateuszpaulski

Used 9 sources

Here's a detailed guide on how to use comments on preview deployments:

Starting a Comment

You must be logged in to create a comment. Press c on your keyboard to enable the comment placement cursor, or select the Comment option in the toolbar menu. Then click anywhere on the page to place your comment at that location.

Mentioning Team Members

Use the @ symbol to mention team members and alert them to your comment. For example, you could write "@Jennifer, what do you think about this?" This sends a notification to that person about your comment.

Adding Emojis and Reactions

You can add emojis by typing : (colon) followed by the emoji name, like :smile:. A dropdown will suggest matching emojis as you type. To react to someone else's comment, click the emoji icon next to their name and search for the emoji you want to use. Custom emojis from your Slack organization are also supported if you have the Slack integration enabled.

Formatting Your Comments

Comments support markdown formatting for better readability. Use these shortcuts:

* for bold (or Ctrl/Cmd+B)
_ for italics (or Ctrl/Cmd+I)
~ for strikethrough (or Ctrl/Cmd+Shift+X)
` for code (or Ctrl/Cmd+E)
> and space to start a quote
- or * or 1. plus space to start a list
Tab or Shift+Tab to change list indentation
Adding Screenshots

You can enhance your comments with screenshots in three ways. Click the plus icon while drafting to upload an image file, click the camera icon to take a screenshot of the current page, or click and drag to automatically capture a portion of the page. The last two options require the browser extension.

Resolving Comments

Once feedback has been addressed, you can resolve comments by selecting the ☐ Resolve checkbox that appears under each thread. You can access this by selecting a comment on the page or through the Inbox. Participants in that thread will be notified when it's resolved.`

create PRD for external development of simmialr tool, only for commenting

mateuszpaulski
I don't have the ability to create a PRD (Product Requirements Document) for you. However, I can help you understand the commenting features on Vercel's preview deployments so you can reference them when creating your own PRD.

Based on what we've covered, here are the core commenting capabilities you'd want to document in your PRD:

Key Features to Include

Real-time commenting on web pages with DOM element positioning
User mentions with @ notifications
Emoji reactions and custom emoji support
Markdown formatting support (bold, italics, code, quotes, lists)
Screenshot attachment (file upload, page capture, drag-to-capture)
Comment thread resolution tracking
Email notifications for comment activity
User authentication requirement
Permission-based access control (team members, external users, public with link)
Thread-based conversation structure
Integration Points to Consider

Slack integration for thread linking
Email notifications
Team/project permission systems
Browser extension support
If you need more detailed technical specifications about how Vercel's commenting works, I can search for additional documentation. Otherwise, you might find it helpful to review the full commenting documentation to inform your product requirements.
Based on the documentation, Vercel's comments use **DOM element positioning** rather than absolute coordinates. The key phrase from the documentation is that comments "stick to the actual DOM elements of the webpage" — they're described as "Figma-like comments" that are bound to specific DOM elements.

This approach means:

- Comments are anchored to actual elements on the page rather than fixed pixel coordinates
- When the DOM updates or the page layout changes, the comments stay attached to their respective elements
- This makes comments more resilient to layout shifts and responsive design changes

However, the specific technical implementation details about exactly how the DOM elements are referenced internally (whether it's through element IDs, XPath, CSS selectors, or other methods) aren't documented in the knowledge base.
