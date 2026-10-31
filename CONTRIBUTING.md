# Contributing

Use this guide when you change NotForMe.

## Before you start

Read the README and the relevant files in docs/.

Open an issue before you make a large change.

Do not include API keys, credentials, or private article data in a change.

## Local checks

Run the test suite.

    npm test
    npm run check
    npm run package
    npm run package:check

The tests use a mock API. They do not need an API key.

## Pull requests

Describe the user-visible behavior.

List the commands that you ran.

Include a test for each changed behavior.

Keep each pull request focused on one purpose.

Do not change supported sites without an adapter test.

## Code changes

Match the existing JavaScript style.

Keep API keys in local storage or the relay environment.

Keep article data within the documented title and summary limits.

Update the README when an installation step or user-visible limit changes.
