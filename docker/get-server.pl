#!/usr/bin/perl
use strict;
use warnings;
use IO::Socket::INET;
use JSON::PP;

my $listen = IO::Socket::INET->new(
    LocalAddr => '127.0.0.1',
    LocalPort => 4174,
    Proto     => 'tcp',
    Listen    => 16,
    ReuseAddr => 1,
) or die "get-server: $!\n";

$SIG{PIPE} = 'IGNORE';

while (my $client = $listen->accept) {
    eval { handle($client) };
    warn "get-server: $@" if $@;
    close $client;
}

sub nonempty {
    for my $value (@_) {
        return $value if defined $value && length $value;
    }
    return '';
}

sub handle {
    my ($client) = @_;
    $client->autoflush(1);

    my $request = '';

    while (1) {
        my $line = <$client>;
        last unless defined $line;
        $request .= $line;
        last if $request =~ /\r?\n\r?\n/;
    }

    return unless length $request;

    my %headers;
    my @lines = split /\r?\n/, $request;
    shift @lines;
    for my $line (@lines) {
        last if $line eq '';
        next unless $line =~ /^([^:]+):\s*(.*)$/;
        my $name  = lc $1;
        my $value = $2;
        $value =~ s/\s+\z//;
        if (exists $headers{$name}) {
            $headers{$name} .= ', ' . $value;
        }
        else {
            $headers{$name} = $value;
        }
    }

    delete $headers{via};

    my $peer = '';
    if (defined $headers{'x-forwarded-for'}) {
        my @hops = grep { length } map { s/^\s+|\s+$//gr } split /,/, $headers{'x-forwarded-for'};
        $peer = $hops[-1] // '';

        if (@hops > 1) {
            $headers{'x-forwarded-for'} = join ', ', @hops[0 .. $#hops - 1];
        }
        else {
            delete $headers{'x-forwarded-for'};
        }
    }

    my $remote = nonempty(
        $headers{'cf-connecting-ip'},
        $headers{'x-real-ip'},

        do {
            my $xff = $headers{'x-forwarded-for'} // '';
            (map { s/^\s+|\s+$//gr } split /,/, $xff)[0];
        },

        $peer,
    );

    my $body = JSON::PP->new->canonical(1)->utf8->encode({
        'remote-ip' => $remote,
        'peer-ip'   => $peer,
        headers     => \%headers,
    });

    print $client join '',
        "HTTP/1.1 200 OK\r\n",
        "Content-Type: application/json; charset=utf-8\r\n",
        'Content-Length: ', length($body), "\r\n",
        "Connection: close\r\n",
        "Cache-Control: no-store\r\n",
        "\r\n",
        $body;
}
