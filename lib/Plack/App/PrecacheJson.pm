package Plack::App::PrecacheJson;
use strict;

use Digest::SHA256;

# At startup (or on first call?!), we initialize the list
# and cache the results

# Then we serve the canned data every time

# Optionally, we flush the cache

# Also if this URL is invoked, at least from localhost
# + with credentials

1;