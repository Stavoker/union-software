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

function is_yandex_indexing_bot(): bool {
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
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
