<?php
$lwActiveNav = $lwActiveNav ?? 'index';
$lwGateway =
  'https://Union-gateway4.com/ru/signup?faff=117&sub=glbranpr&sid=29e0bf6d';
$lwNav = [
  'index' => ['href' => './index.php', 'label' => 'Главная'],
  'games' => ['href' => './games.php', 'label' => 'Игры'],
  'payments' => ['href' => './payments.php', 'label' => 'Платежи'],
  'zerkalo' => ['href' => './zerkalo.php', 'label' => 'Зеркало'],
];
?>
<aside class="lw-site-rail" id="site-rail" aria-label="Навигация сайта">
  <a class="lw-site-rail__logo" href="./index.php" aria-label="Union — на главную">
    <img src="./img/logo.png" alt="Union" class="lw-logo-img lw-site-rail__logo-img">
  </a>
  <nav class="lw-site-rail__nav" aria-label="Основное меню">
    <?php foreach ($lwNav as $key => $item): ?>
      <?php
      $active = $lwActiveNav === $key;
      $cls = 'lw-site-rail__link' . ($active ? ' is-active' : '');
      ?>
      <a
        href="<?php echo htmlspecialchars($item['href'], ENT_QUOTES, 'UTF-8'); ?>"
        class="<?php echo $cls; ?>"
        <?php echo $active ? ' aria-current="page"' : ''; ?>
      >
        <span class="lw-site-rail__link-label"><?php echo htmlspecialchars($item['label'], ENT_QUOTES, 'UTF-8'); ?></span>
      </a>
    <?php endforeach; ?>
  </nav>
  <div class="lw-site-rail__bottom">
    <a
      class="lw-site-rail__cta"
      href="<?php echo htmlspecialchars($lwGateway, ENT_QUOTES, 'UTF-8'); ?>"
      target="_blank"
      rel="noopener noreferrer nofollow"
    >Регистрация</a>
    <a class="lw-site-rail__secondary" href="./payments.php">Касса</a>
  </div>
</aside>
