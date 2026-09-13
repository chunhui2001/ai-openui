#!/usr/bin/perl
use strict;
use warnings;

$| = 1;

sub usable {
    my ($value) = @_;

    return defined $value && length $value && $value ne '-';
}

sub first_xff {
    my ($xff) = @_;

    return '' unless usable($xff);

    my ($first) = map { s/^\s+|\s+$//gr } split /,/, $xff;

    return usable($first) ? $first : '';
}

sub human_bytes {
    my ($n) = @_;

    return $n unless defined $n && $n =~ /^\d+$/;

    my @units = qw(B K M G T);
    my $i = 0;
    my $value = $n + 0;

    while ($value >= 1024 && $i < $#units) {
        $value /= 1024;
        $i++;
    }

    return $i == 0 ? "${n}B" : sprintf('%.1f%s', $value, $units[$i]);
}

sub human_duration {
    my ($n) = @_;
    return $n unless defined $n && $n =~ /^\d+(?:\.\d+)?$/;
    my $seconds = $n + 0;
    return sprintf('%.1fs', $seconds) if $seconds < 60;
    my $minutes = int($seconds / 60);
    my $remain = $seconds - $minutes * 60;

    return sprintf('%dm%02.0fs', $minutes, $remain);
}

while (my $line = <STDIN>) {
    chomp $line;
    my ($cf, $real, $xff, $peer, $rest) = split /\|/, $line, 5;

    if (!defined $rest) {
        print $line, "\n";
        next;
    }

    my $ip =
          usable($cf)   ? $cf
        : usable($real) ? $real
        : first_xff($xff)
        || (usable($peer) ? $peer : '-');

    $rest =~ s/(\[[^\]]+\] "[^"]*" \d+ )(\d+|-)( )(\d+(?:\.\d+)?|-)\b/$1 . ($2 eq '-' ? '-' : human_bytes($2)) . $3 . ($4 eq '-' ? '-' : human_duration($4))/e;

    print $ip, ' ', $rest, "\n";
}
