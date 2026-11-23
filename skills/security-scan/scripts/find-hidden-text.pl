#!/usr/bin/perl
# Report invisible / hidden Unicode code points in every text file under a directory.
# Usage: find-hidden-text.pl DIR
# Output: path:line:col U+XXXX class   (col is a 1-based character offset)
#         path:line:col decoded Tags run: "text"   (one per run of Unicode Tags)
# Always exits 0. Core Perl only.
use strict;
use warnings;
use File::Find;
use Encode qw(decode FB_CROAK);

my $dir = shift @ARGV;
unless (defined $dir && -d $dir) {
    print STDERR "usage: find-hidden-text.pl DIR\n";
    exit 0;
}

# Order matters: first matching class wins.
my @classes = (
    [ 'tags',               qr/[\x{E0000}-\x{E007F}]/ ],
    [ 'bidi',               qr/[\x{202A}-\x{202E}\x{2066}-\x{2069}]/ ],
    [ 'zero-width',         qr/[\x{200B}-\x{200F}\x{FEFF}\x{00AD}\x{2060}\x{180E}]/ ],
    [ 'variation-selector', qr/[\x{FE00}-\x{FE0F}\x{E0100}-\x{E01EF}]/ ],
    [ 'invisible',          qr/[\x{034F}\x{061C}\x{115F}\x{1160}\x{17B4}\x{17B5}\x{2061}-\x{2064}\x{206A}-\x{206F}\x{3164}\x{FFA0}\x{FFF9}-\x{FFFB}]/ ],
);
my $any = join '|', map { $_->[1] } @classes;
$any = qr/(?:$any)/;

sub scan_file {
    my ($path) = @_;
    open(my $fh, '<:raw', $path) or return;
    my $head = '';
    read($fh, $head, 8192);
    return if index($head, "\0") >= 0;    # binary
    seek($fh, 0, 0);
    my $n = 0;
    while (my $raw = <$fh>) {
        $n++;
        my $line = eval { decode('UTF-8', $raw, FB_CROAK) };
        next unless defined $line;
        next unless $line =~ $any;
        while ($line =~ /($any)/g) {
            my $ch  = $1;
            my $col = $-[0] + 1;
            my $cp  = ord $ch;
            next if $n == 1 && $col == 1 && $cp == 0xFEFF;    # a leading BOM is normal
            for my $c (@classes) {
                if ($ch =~ /\A$c->[1]\z/) {
                    printf "%s:%d:%d U+%04X %s\n", $path, $n, $col, $cp, $c->[0];
                    last;
                }
            }
        }
        while ($line =~ /([\x{E0000}-\x{E007F}]+)/g) {
            my $col = $-[0] + 1;
            my $txt = join '', map {
                my $b = ord($_) - 0xE0000;
                ($b >= 0x20 && $b <= 0x7E) ? chr($b) : sprintf('\\x%02X', $b);
            } split //, $1;
            printf "%s:%d:%d decoded Tags run: \"%s\"\n", $path, $n, $col, $txt;
        }
    }
    close $fh;
}

find({
    no_chdir => 1,
    wanted   => sub {
        if (-d $_ && $File::Find::name ne $dir && (split m{/}, $_)[-1] eq '.git') {
            $File::Find::prune = 1;
            return;
        }
        scan_file($File::Find::name) if -f $_ && !-l $_;
    },
}, $dir);
exit 0;
