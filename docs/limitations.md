The lack of a server leads to the following limitations:

## Content can vary per-request only client-side

To have something change based on cookies or query string, it has to be in the user's browser.

For example, if you want to have search with tags and filtering:

1. You have an index with all entries and their parameters
2. The index is downloaded client-side once searching starts
3. The browser displays results instantly from the index

You can't narrow the search down outside the browser because S3 can only return static files. The closest you could have is to simply have a few pre-rendered files that already contain the filter results. But that would require anticipating what the user will search.

Essentially, whatever data you might need, it has to be generated _by the editor_ while they're in the admin. You can't generate anything on-demand, per-request.

## Authentication can't have dynamically generated tokens

The highest level of security revolves around dynamically generating tokens (be it JWT or TOTP) that restrict a session in time. You get a token right now, just for you, you prove who you are, and you're let in for X amount of time.

But since nothing can be generated on-demand, that involves access tokens. So whatever you use for logging in must be static. You _can_ rotate it, but it just has to happen _after_ you've logged in.
